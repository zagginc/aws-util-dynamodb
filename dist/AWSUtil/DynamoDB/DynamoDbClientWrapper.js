"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDbClientWrapper = exports.GetDefaultMarshallOptions = exports.DEFAULT_TABLE_PREFIX = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const aws_xray_sdk_1 = __importDefault(require("aws-xray-sdk"));
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const lambda_log_1 = require("lambda-log");
const dynamodb_types_1 = require("./dynamodb-types");
exports.DEFAULT_TABLE_PREFIX = (process.env.TABLE_PREFIX || process.env.ENVIRONMENT_NAME || 'local');
/**
 * The number of milliseconds to wait after a newly created table reports itself to be ACTIVE.
 */
const DEFAULT_CREATE_TABLE_DELAY_AFTER_ACTIVE = 5000;
const DEFAULT_MARSHALL_OPTIONS = {
    convertClassInstanceToMap: true,
    convertEmptyValues: false,
    removeUndefinedValues: true,
};
/**
 * Get a copy of the defaul `marshalOptions` used if none are provided to the
 * `DynamoDbClientWrapper` constructor. This function's use case is if you want
 * to start with the default options and edit vs create your own from scratch.
 * @returns marshallOptions
 */
function GetDefaultMarshallOptions() {
    return { ...DEFAULT_MARSHALL_OPTIONS };
}
exports.GetDefaultMarshallOptions = GetDefaultMarshallOptions;
/**
 * This is an internal config used in `_CreateKeyMapping`
 */
const DEFAULT_MARSHALL_OPTIONS_KEYS = {
    convertEmptyValues: false,
    removeUndefinedValues: true,
};
const ArgumentError = (message) => {
    const err = new Error(message);
    err.name = 'ArgumentError';
    return err;
};
/**
 *
 */
class DynamoDbClientWrapper {
    /**
     * @param tablePrefix appended to the begining of all table names created or accessed by this class.
     * Use this to namespace your tables. Default Value: `process.env.TABLE_PREFIX`
     * @param options optional configuration for this class for things such as logging, debug, or passing through configuration to the underlying DynamoDB client
     */
    constructor(tablePrefix = exports.DEFAULT_TABLE_PREFIX, options) {
        this._debugMode = false;
        this._delayAfterCreateTable = DEFAULT_CREATE_TABLE_DELAY_AFTER_ACTIVE;
        this.TablePrefix = tablePrefix;
        this._marshallOptions = options?.MarshallOptions ?? DEFAULT_MARSHALL_OPTIONS;
        this._dynamoDBClientConfig = options?.DynamoDBClientConfig ?? {};
        this._delayAfterCreateTable = options?.DelayAfterCreateTable ?? DEFAULT_CREATE_TABLE_DELAY_AFTER_ACTIVE;
        if (options?.Logger) {
            this._log = options.Logger;
        }
        else {
            // 'as any' because the types library is not updated for v3 of lambda-log
            const logOptions = {
                levelKey: 'level',
                ...options?.LogOptions,
            };
            this._log = new lambda_log_1.LambdaLog(logOptions, { debug: 'info' });
        }
        this._debugMode = options?.DebugMode ?? false;
    }
    // #region Getters / Setters
    /**
     * If you need to execute raw DynamoDb operations not covered by this warapper, you can obtain
     * the instantiated DynamoDb client here. It is more performant to re-use the client than create
     * a new one.
     * @returns DynamoDBClient
     */
    get DynamoDbClient() {
        return (this._dbClient ?? (this._dbClient = this._createDbClient()));
    }
    get TablePrefix() {
        return this._tablePrefix;
    }
    set TablePrefix(prefix) {
        if (typeof prefix === 'string' && prefix.length === 0) {
            throw ArgumentError('prefix cannot be an empty string');
        }
        this._tablePrefix = prefix;
    }
    // #endregion
    /**
     * Internal function to create and wrap the underlying DynamoDB client with XRay tracing
     */
    _createDbClient() {
        let client = new client_dynamodb_1.DynamoDBClient(this._dynamoDBClientConfig);
        if (process.env._X_AMZN_TRACE_ID) {
            // only capture for xray if running in lambda or a trace ID is set
            // (which requires you to have started a local XRay Daemon and configure the settings elsewhere to connect to ir)
            client = aws_xray_sdk_1.default.captureAWSv3Client(client);
        }
        this._log.debug('Created DynamoDBClient', { DynamoDBClientConfig: this._dynamoDBClientConfig });
        return client;
    }
    /**
     * Destroys the underlying DynamoDB client freeing up any resources or sockets it may be using.
     * @see {@link DynamoDBClient.destroy}
     */
    Destroy() {
        this._dbClient?.destroy();
    }
    // #region Table Operations
    /**
     * Utility function which will take an IDynamoDbItem instance and output the table name that
     * will be used for reading/writing this class data. Mostly this is used internally in this
     * class but if you need to manipulate a DynamoDB table directly for a class, this allows
     * you to ensure you are using the same table name as this class uses (with the right table
     * prefix set as per the constructor of this class).
     *
     * @param  {IDynamoDbItem|string} item
     * @returns string
     */
    GenerateTableName(item) {
        const baseTableName = typeof item === 'string' ? item : item.BaseTableName();
        if (this.TablePrefix) {
            return `${this.TablePrefix}.${baseTableName}`;
        }
        return baseTableName;
    }
    /**
     * This is public to provide for advanced usage, but likely you just want to call `InitializeTable`
     * which will use this function as part of the table creation process.
     *
     * @param  {IDynamoDbItem} type
     * @returns CreateTableInput
     */
    CreateSchema(type, options) {
        options = {
            BillingMode: 'PAY_PER_REQUEST',
            StreamSpecification: {
                StreamEnabled: false,
            },
            ...options,
        };
        const table = {
            ...options,
            TableName: this.GenerateTableName(type),
            AttributeDefinitions: type.AttributeDefinitions(),
            KeySchema: type.KeySchema(),
            LocalSecondaryIndexes: type.LocalSecondaryIndexes(),
            GlobalSecondaryIndexes: type.GlobalSecondaryIndexes(),
        };
        return table;
    }
    /**
     * Get a list of all the tables avaialble on DynamoDb.
     *
     * Typically you would use the output of this to search for the existance of a
     * specific table as it's faster to ListTables than to Describe them all.
     *
     * @returns Promise<string[]> a list of the Table Names for all the tables on DynamoDb
     */
    async ListTables() {
        try {
            const { TableNames } = await this.DynamoDbClient.send(new client_dynamodb_1.ListTablesCommand({}));
            return TableNames || []; // new Array<string>();
        }
        catch (error) {
            this._log.error(error);
            throw error;
        }
    }
    /**
     * The primary mechanism for ensuring a DynamoDb table exists.
     * `IDynamoDbItem`s self-describe their table structure so this function uses the definition of the
     * provided Type to infer the required table definition and create it if it does not exist.
     *
     * It is safe to call this multiple times for the same table as it will only perform a write operation
     * if the table does not already exist. However, for performance reasons, you should try and only call
     * it again for the same Type if you get read/write errors that indicate the table does not exist.
     *
     * E.g. call it during your program's initialization routines and save the state that the table exists
     *
     * @param  {IDynamoDbBasicItemConstructor<T>} Type
     * @param  {string[]} existingTables? if you already have a list of tables you know exist, you can pass
     * it here to avoid one extra `ListTables` call
     */
    async InitializeTable(Type, existingTables, options) {
        existingTables = existingTables || await this.ListTables();
        const typeShell = new Type();
        const tableName = this.GenerateTableName(typeShell);
        if (existingTables.includes(tableName)) {
            this._log.info('InitializeTable: Table Exists', { tableName });
        }
        else {
            this._log.info('Initialize Table', { tableName });
            if (!await this.CreateTableIfNotExists(this.CreateSchema(typeShell, options), true, typeShell.TTLFieldName())) {
                throw new Error(`Fatal Error: Could not create ${tableName}`);
            }
        }
    }
    /**
     * Checks to see if the table already exists before trying to create it.
     * If the table already exists, it returns the TableDescription of the existing table, otherwise
     * it will call CreateTable and return the output from that command.
     *
     * Typically this function is used on application startup or initialization to simply initialize DynamoDb tables if needed.
     *
     * Note: You probably want to use `InitializeTable` unless you know what you're doing
     *
     * @param  {CreateTableInput} input
     * @param  {boolean=true} waitForActive
     * @returns Promise
     */
    async CreateTableIfNotExists(input, waitForActive = true, ttlAttributeName) {
        if ((await this.ListTables()).some(t => t === input.TableName)) {
            const tableDescription = await this.DescribeTable(input?.TableName);
            return tableDescription;
        }
        return await this.CreateTable(input, waitForActive, ttlAttributeName);
    }
    /**
     * Delegate to the DynamoDB {@link DescribeTableCommand}
     * If the table does not exist, `undefined` will be returned.
     *
     * @param  {string} tableName
     * @returns TableDescription
     */
    async DescribeTable(tableName) {
        try {
            const out = await this.DynamoDbClient.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableName }));
            if (out?.Table?.TableName === tableName) {
                return out.Table;
            }
        }
        catch (error) {
            // Allow an undefined response if the table doesn't exist, but throw all other exceptions
            if (error.name !== 'ResourceNotFoundException') {
                this._log.error(error);
                throw error;
            }
        }
        return undefined;
    }
    /**
     * Create a new DynamoDb Table from the given table description input.
     *
     * Note: You probably want to use `InitializeTable` unless you know what you're doing.
     *
     * @param  {CreateTableInput|string} input
     * @param  {boolean=true} waitForActive     if true, then the function will poll the state of the new
     *                                          table until it's 'ACTIVE', otehrwise the function will return
     *                                          immediately but the table may not be available for use yet.
     * @returns Promise<boolean | TableDescription>
     */
    async CreateTable(input, waitForActive = true, ttlAttributeName) {
        if (ttlAttributeName !== undefined && ttlAttributeName.length === 0) {
            throw ArgumentError('ttlAttributeName cannot be an empty string');
        }
        const table = input;
        let tableDescription;
        // CREATE THE TABLE
        try {
            const data = await this.DynamoDbClient.send(new client_dynamodb_1.CreateTableCommand(table));
            if (data && data.TableDescription) {
                this._log.debug('Table Created', { data });
            }
            else {
                throw new Error(`Unable to create table '${table.TableName}'`);
            }
            tableDescription = data.TableDescription;
        }
        catch (error) {
            this._log.error(error, { ref: 'CreateTable' });
            return undefined;
        }
        // WAIT FOR TABLE TO BE 'ACTIVE'
        let subsegment;
        if (waitForActive && process.env._X_AMZN_TRACE_ID) {
            subsegment = aws_xray_sdk_1.default.getSegment()?.addNewSubsegment('WaitForActiveTable');
        }
        while (waitForActive && tableDescription && tableDescription.TableStatus != 'ACTIVE') {
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                const data = await this.DynamoDbClient.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableDescription.TableName }));
                if (data && data.Table) {
                    this._log.debug('Table Status', { TableStatus: data.Table.TableStatus });
                }
                else {
                    throw new Error(`Unable to describe table '${tableDescription.TableName}'`);
                }
                tableDescription = data.Table;
            }
            catch (error) {
                this._log.error(error, { ref: 'CreateTable: Waiting for ACTIVE' });
                if (subsegment) {
                    subsegment.close(error);
                }
                throw error;
            }
        }
        if (subsegment) {
            subsegment.close();
        }
        if (this._delayAfterCreateTable) {
            this._log.info(`Pausing for ${this._delayAfterCreateTable}ms after ${tableDescription.TableName} has reported ACTIVE...`, { tableDescription });
            let subsegment;
            if (process.env._X_AMZN_TRACE_ID) {
                subsegment = aws_xray_sdk_1.default.getSegment()?.addNewSubsegment('DelayAfterCreateTable');
            }
            try {
                await new Promise(resolve => setTimeout(resolve, this._delayAfterCreateTable));
            }
            catch (error) {
            }
            finally {
                if (subsegment) {
                    subsegment.close();
                }
            }
        }
        if (ttlAttributeName) {
            try {
                const data = await this.DynamoDbClient.send(new client_dynamodb_1.UpdateTimeToLiveCommand({
                    TableName: tableDescription.TableName,
                    TimeToLiveSpecification: {
                        Enabled: true,
                        AttributeName: ttlAttributeName,
                    },
                }));
                if (!data || !data.TimeToLiveSpecification || !data.TimeToLiveSpecification.Enabled) {
                    throw new Error(`Unable to enable TTL on '${tableDescription.TableName}' using attribute '${ttlAttributeName}'`);
                }
            }
            catch (error) {
                this._log.error(error, { ref: 'CreateTable:EnableTTL' });
                throw error;
            }
        }
        return tableDescription;
    }
    /**
     * This action will perform a *specific* set of updates to try and deal with data structure
     * migration and changes. It is **NOT** a complete update of all table structure, it performs
     * *only* the checks below:
     *
     * * DELETE any GlobalSecondaryIndexes which no longer exist on the Item definition by comparing
     *   the IndexName only (not the actual index structure/definition)
     * * CREATE any new GlobalSecondaryIndexes which exist on the Item definition but do not exist on
     *   the table currently
     */
    async UpdateTable(item) {
        const TableName = this.GenerateTableName(item);
        const table = await this.DescribeTable(TableName);
        if (!table) {
            throw new Error(`Table Not Found: ${TableName}`);
        }
        const gsiCurrent = item.GlobalSecondaryIndexes();
        for (const gsi of (table.GlobalSecondaryIndexes ?? [])) {
            if (!gsiCurrent?.find(c => c.IndexName === gsi.IndexName)) {
                const updated = await this.DynamoDbClient.send(new client_dynamodb_1.UpdateTableCommand({
                    TableName,
                    GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: gsi.IndexName } }],
                }));
                this._log.debug(`Deleted GSI: ${TableName}/${gsi.IndexName}`, { gsi, updated });
            }
        }
        const AttributeDefinitions = item.AttributeDefinitions();
        for (const gsi of (gsiCurrent ?? [])) {
            if (!table.GlobalSecondaryIndexes?.find(c => c.IndexName === gsi.IndexName)) {
                const updated = await this.DynamoDbClient.send(new client_dynamodb_1.UpdateTableCommand({
                    TableName,
                    AttributeDefinitions,
                    GlobalSecondaryIndexUpdates: [{ Create: { ...gsi } }],
                }));
                this._log.debug(`Created GSI: ${TableName}/${gsi.IndexName}`, { updated });
            }
        }
        return await this.DescribeTable(TableName);
    }
    // #endregion Table Operations
    /**
     * INTERNAL helper method to pull in the ID & Range key data to the form needed for some DynamoDb operations
     * Typically this is used when Get/Put a specific item.
     *
     * @param  {T} item
     * @param  {string|number} id
     * @param  {string|number|boolean} range?
     * @param  {marshallOptions=DEFAULT_MARSHALL_OPTIONS_KEYS} options
     * @returns AttributeValue
     */
    _CreateKeyMapping(item, id, range, options = DEFAULT_MARSHALL_OPTIONS_KEYS) {
        const keys = {
            [item.IdFieldName()]: id,
        };
        const rangeFieldName = item.RangeFieldName();
        if (rangeFieldName !== undefined) {
            if (range !== undefined) {
                keys[rangeFieldName] = range;
            }
            else {
                throw ArgumentError('The IDynamoDbItem defines a RangeFieldName but an undefined range parameter was provided. ' +
                    'If a Range field is defined in the table schema for DynamoDB, you MUST provide it to lookup an item.');
            }
        }
        return (0, util_dynamodb_1.marshall)(keys, options);
    }
    /**
     * @param  {IDynamoDbBasicItemConstructor<T>} Type
     * @param  {string|number} id
     * @param  {string|number|boolean} range?
     * @param  {ReturnValue=NONE} returnValue Allowed Values: NONE | ALL_OLD
     * @returns Promise<T | boolean> if returnValue is "ALL_OLD" then the deleted item will be returned after
     *                               being deserialized into the provided Type. Otherwise, a boolean will be
     *                               returned indicating success or failure of the operation.
     */
    async DeleteItem(Type, id, range, returnValue = 'NONE') {
        if (typeof id === 'string' && id.length === 0) {
            throw ArgumentError('id cannot be an empty string');
        }
        if (typeof range == 'string' && range.length === 0) {
            throw ArgumentError('range cannot be an empty string');
        }
        let item = new Type();
        const params = {
            TableName: this.GenerateTableName(item),
            Key: this._CreateKeyMapping(item, id, range),
            ReturnValues: returnValue,
        };
        let Attributes;
        try {
            const response = await this.DynamoDbClient.send(new client_dynamodb_1.DeleteItemCommand(params));
            this._log.debug('DeleteItem: Deleted', { response });
            if (!response?.Attributes && returnValue === 'ALL_OLD') {
                return false;
            }
            Attributes = response.Attributes;
        }
        catch (error) {
            this._log.error(error, { ref: 'DeleteItem' });
            throw error;
        }
        if (returnValue === 'ALL_OLD') {
            if (!Attributes) {
                throw new Error(`DeleteItem appeared to succeed however ${returnValue} was specified and no attributes are returned. In theory, thiis should not be possible...`);
            }
            item = item.Assign((0, util_dynamodb_1.unmarshall)(Attributes));
            this._log.debug('DeleteItem: Unmarshalled', { item });
            return item;
        }
        return true;
    }
    // #region Read: Multiple Items
    /**
     * Get all items from a DynamoDb table that match specific Id and (optionally) Range Key criteria
     *
     * Uses: Query, if id is provided
     * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-dynamodb/classes/querycommand.html
     *
     * Uses: Scan, if id is not provided (slower and more expensive, on larger tables, paging may be required... which is not implemented in this function)
     *
     * @param  {IDynamoDbBasicItemConstructor<T>} type
     * @param  {string|number} id?
     * @param  {string|number|boolean} range?
     * @param  {boolean=true} consistentRead
     * @returns Promise
     */
    async GetItems(type, id, range, options) {
        options = {
            ...options,
        };
        if (id !== undefined) {
            this._log.debug('GetItems ==> Query', { id, range, options });
            return await this.Query(type, id, range, options);
        }
        this._log.debug('GetItems ==> Scan', { id, range, options });
        return await this.Scan(type, undefined, range, options);
    }
    /**
     * Get all items from a DynamoDb table.
     *
     * Optional: filter by Id and Range Key criteria
     *
     * Uses: Scan
     * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-dynamodb/classes/querycommand.html
     *
     * @param  {IDynamoDbBasicItemConstructor<T>} Type
     * @param  {string|number} id?
     * @param  {string|number|boolean} range?
     * @param  {boolean=true} consistentRead
     * @returns Promise
     */
    async Scan(Type, id, range, options) {
        // if (typeof id === 'undefined' && typeof range === 'undefined') {
        // 	throw new Error('At least one of id or range is required.');
        // }
        if (typeof id === 'string' && id.length === 0) {
            throw ArgumentError('id cannot be an empty string');
        }
        if (typeof range === 'string' && range.length === 0) {
            throw ArgumentError('range cannot be an empty string');
        }
        options = {
            ...options,
        };
        if (this._debugMode && options.IndexName && !options.IndexPartitionKeyFieldName) {
            this._log.warn('IndexName is specified but IndexPartitionKeyFieldName is not.', { IndexName: options.IndexName });
        }
        let FilterExpression = undefined;
        let ExpressionAttributeValues = undefined;
        const typeShell = new Type();
        const rawExpressionAttributeValues = {};
        if (options.ExpressionAttributeValues) {
            Object.assign(rawExpressionAttributeValues, options.ExpressionAttributeValues);
        }
        let ExpressionAttributeNames = {};
        if (id !== undefined) {
            const partitionKeyName = options.IndexPartitionKeyFieldName ?? typeShell.IdFieldName();
            // field names prefixed with '#' to allow using field names that are also reserved words in DynamoDB
            FilterExpression = `#${partitionKeyName} = :partitionkeyval`;
            rawExpressionAttributeValues[':partitionkeyval'] = id;
            ExpressionAttributeNames[`#${partitionKeyName}`] = `${partitionKeyName}`;
        }
        // add in range condition if applicable...
        if (range !== undefined) {
            const sortKeyName = options?.IndexRangeFieldName ?? typeShell.RangeFieldName();
            if (!sortKeyName) {
                const msg = 'Range value was provided but Range Field name cannot be determined.';
                this._log.error(msg, {
                    range,
                    IndexRangeFieldName: options?.IndexRangeFieldName ?? 'undefined',
                    RangeFieldName: typeShell.RangeFieldName() ?? 'undefined',
                });
                throw new Error(msg);
            }
            // field names prefixed with '#' to allow using field names that are also reserved words in DynamoDB
            FilterExpression = `${(FilterExpression ? `${FilterExpression} AND ` : '')}#${sortKeyName} = :sortkeyval`;
            rawExpressionAttributeValues[':sortkeyval'] = range;
            ExpressionAttributeNames[`#${sortKeyName}`] = `${sortKeyName}`;
        }
        if (options.FilterExpression) {
            FilterExpression = `${(FilterExpression ? `${FilterExpression} AND ` : '')}${options.FilterExpression}`;
        }
        if (Object.keys(ExpressionAttributeNames)?.length == 0) {
            ExpressionAttributeNames = undefined;
        }
        ExpressionAttributeValues =
            Object.keys(rawExpressionAttributeValues).length > 0 ?
                (0, util_dynamodb_1.marshall)(rawExpressionAttributeValues) :
                undefined;
        let ExclusiveStartKey = undefined;
        if (options.ExclusiveStartKey) {
            ExclusiveStartKey = {};
            ExclusiveStartKey[options.IndexPartitionKeyFieldName ?? typeShell.IdFieldName()] = options.ExclusiveStartKey;
        }
        // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-dynamodb/modules/queryinput.html
        const params = {
            ...options,
            TableName: this.GenerateTableName(typeShell),
            FilterExpression,
            ExpressionAttributeValues,
            ExpressionAttributeNames,
            Select: 'ALL_ATTRIBUTES',
            ExclusiveStartKey: ExclusiveStartKey ? (0, util_dynamodb_1.marshall)(ExclusiveStartKey) : undefined,
        };
        this._log.debug('Scan', { params });
        const items = []; // new Array<T>();
        try {
            let result;
            do {
                result = await this.DynamoDbClient.send(new client_dynamodb_1.ScanCommand(params));
                const { Items, Count, ScannedCount, LastEvaluatedKey } = result;
                if (this._debugMode) {
                    this._log.debug('ScanCommandOutput', { ...result, Items: undefined });
                    this._log.debug('Scan: Response.Items', { id, range, Items });
                }
                else {
                    this._log.debug('Scan Info', { Count, ScannedCount, LastEvaluatedKey });
                }
                if (Items) {
                    items.push(...Items.map((item) => new Type().Assign((0, util_dynamodb_1.unmarshall)(item))));
                }
                if (this._debugMode) {
                    this._log.debug('Scan: Unmarshalled', { items });
                }
                params.ExclusiveStartKey = LastEvaluatedKey;
            } while (params.ExclusiveStartKey !== undefined && (options.Limit === undefined || items.length < options.Limit));
        }
        catch (error) {
            if (error?.name === 'ResourceNotFoundException') {
                this._log.warn('Scan: ResourceNotFoundException - the Table does not exist', { params, error });
                if (this._debugMode) {
                    const existingTables = await this.ListTables();
                    this._log.debug('Existing Tables', { existingTables });
                }
                if (options.IgnoreTableNotFound !== true) {
                    throw error;
                }
                else {
                    return items;
                }
            }
            else {
                this._log.error(`Scan: ${error.name ?? 'UNKOWN_ERROR'}`, { params, error });
                throw error;
            }
        }
        return items;
    }
    /**
     * Get all items from a DynamoDb table that match specific Id and (optionally) Range Key criteria
     *
     * Uses: Query, if id is provided
     * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-dynamodb/classes/querycommand.html
     *
     * @param  {IDynamoDbBasicItemConstructor<T>} Type
     * @param  {string|number} id
     * @param  {string|number|boolean} range?
     * @param  {boolean=true} consistentRead
     * @returns Promise
     */
    async Query(Type, id, range, options) {
        if (typeof id === 'string' && id.length === 0) {
            throw ArgumentError('id cannot be an empty string');
        }
        if (typeof range === 'string' && range.length === 0) {
            throw ArgumentError('range cannot be an empty string');
        }
        options = {
            ...options,
        };
        if (this._debugMode && options.IndexName && !options.IndexPartitionKeyFieldName) {
            this._log.warn('IndexName is specified but IndexPartitionKeyFieldName is not.', { IndexName: options.IndexName });
        }
        let conditionExpression = undefined;
        let ExpressionAttributeValues = undefined;
        const typeShell = new Type();
        const partitionKeyName = options.IndexPartitionKeyFieldName ?? typeShell.IdFieldName();
        // field names prefixed with '#' to allow using field names that are also reserved words in DynamoDB
        conditionExpression = `#${partitionKeyName} = :partitionkeyval`;
        const rawExpressionAttributeValues = {};
        if (options.ExpressionAttributeValues) {
            Object.assign(rawExpressionAttributeValues, options.ExpressionAttributeValues);
        }
        rawExpressionAttributeValues[':partitionkeyval'] = id;
        const ExpressionAttributeNames = {};
        ExpressionAttributeNames[`#${partitionKeyName}`] = `${partitionKeyName}`;
        // add in range condition if applicable...
        if (range !== undefined) {
            const sortKeyName = options?.IndexRangeFieldName ?? typeShell.RangeFieldName();
            if (!sortKeyName) {
                const msg = 'Range value was provided but Range Field name cannot be determined.';
                this._log.error(msg, {
                    range,
                    IndexRangeFieldName: options?.IndexRangeFieldName ?? 'undefined',
                    RangeFieldName: typeShell.RangeFieldName() ?? 'undefined',
                });
                throw new Error(msg);
            }
            // field names prefixed with '#' to allow using field names that are also reserved words in DynamoDB
            conditionExpression = `${conditionExpression} AND #${sortKeyName} = :sortkeyval`;
            rawExpressionAttributeValues[':sortkeyval'] = range;
            ExpressionAttributeNames[`#${sortKeyName}`] = `${sortKeyName}`;
        }
        ExpressionAttributeValues = (0, util_dynamodb_1.marshall)(rawExpressionAttributeValues);
        let ExclusiveStartKey = undefined;
        if (options.ExclusiveStartKey) {
            ExclusiveStartKey = {};
            ExclusiveStartKey[options.IndexPartitionKeyFieldName ?? typeShell.IdFieldName()] = options.ExclusiveStartKey;
        }
        // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-dynamodb/modules/queryinput.html
        const params = {
            ...options,
            TableName: this.GenerateTableName(typeShell),
            KeyConditionExpression: conditionExpression,
            ExpressionAttributeValues,
            ExpressionAttributeNames,
            FilterExpression: options.FilterExpression,
            Select: 'ALL_ATTRIBUTES',
            ExclusiveStartKey: ExclusiveStartKey ? (0, util_dynamodb_1.marshall)(ExclusiveStartKey) : undefined,
        };
        this._log.debug('Query', { params });
        const items = []; // new Array<T>();
        try {
            let result;
            do {
                result = await this.DynamoDbClient.send(new client_dynamodb_1.QueryCommand(params));
                const { Items, Count, ScannedCount, LastEvaluatedKey } = result;
                if (this._debugMode) {
                    this._log.debug('QueryCommandOutput', { ...result, Items: undefined });
                    this._log.debug('Query: Response.Items', { id, range, Items });
                }
                else {
                    this._log.debug('Query Info', { Count, ScannedCount, LastEvaluatedKey });
                }
                if (Items) {
                    items.push(...Items.map((i) => new Type().Assign((0, util_dynamodb_1.unmarshall)(i))));
                }
                if (this._debugMode) {
                    this._log.debug('Query: Unmarshalled', { items });
                }
                params.ExclusiveStartKey = LastEvaluatedKey;
            } while (params.ExclusiveStartKey !== undefined && (options.Limit === undefined || items.length < options.Limit));
        }
        catch (error) {
            if (error?.name === 'ResourceNotFoundException') {
                this._log.warn('Query: ResourceNotFoundException - the Table does not exist', { params, error });
                if (this._debugMode) {
                    const existingTables = await this.ListTables();
                    this._log.debug('Existing Tables', { existingTables });
                }
                if (options.IgnoreTableNotFound !== true) {
                    throw error;
                }
                else {
                    return items;
                }
            }
            else {
                this._log.error(`Query: ${error.name ?? 'UNKOWN_ERROR'}`, { params, error });
                throw error;
            }
        }
        return items;
    }
    // #endregion Read: Multiple Items
    /**
     * let c: Client = await GetItem(Client, "3412543462475");
     *
     * If the Item is not found, an exception will be thrown.
     * If you set `Required: false` in the `IGetItemOptions`, then undefined will
     * be returned if a value is not found.
     *
     * Any other exceptions are logged and re-thrown for the caller to handle.
     *
     * If the Table does not exist, there will be a `ResourceNotFoundException` thrown.
     *
     * If a secondary index is specified in the {@link options} then this function will compose
     * a {@link DynamoDbClientWrapper.GetItems} request instead (which delegates to
     * {@link DynamoDbClientWrapper.Query} or {@link DynamoDbClientWrapper.Scan})
     * because `GetItem` in DynamoDB only works on the primary index for the table.
     *
     * @param  {IDynamoDbBasicItemConstructor<T>} Type
     * @param  {string|number} id
     * @param  {string|number|boolean} range?
     * @param  {IGetItemOptions} options?
     * @returns the item from DynamoDb or `undefined` if it is not found and `Required: false` is set in the `options`.
     *
     * https://stackoverflow.com/questions/24677592/generic-type-inference-with-class-argument/26696435#26696435
     */
    async GetItem(Type, id, range, options) {
        if (typeof id === 'string' && id.length === 0) {
            throw ArgumentError('id cannot be an empty string');
        }
        if (typeof range == 'string' && range.length === 0) {
            throw ArgumentError('range cannot be an empty string');
        }
        options = {
            Required: true,
            IgnoreTableNotFound: false,
            ...options,
        };
        if (options.IndexName) {
            return (await this.GetItems(Type, id, range, {
                IndexName: options.IndexName,
                IndexPartitionKeyFieldName: options.IndexPartitionKeyFieldName,
                IndexRangeFieldName: options.IndexRangeFieldName,
                ConsistentRead: options.ConsistentRead,
            }))?.[0];
        }
        let item = new Type();
        const params = {
            TableName: this.GenerateTableName(item),
            Key: this._CreateKeyMapping(item, id, range),
            ConsistentRead: options.ConsistentRead,
        };
        this._log.debug('GetItemInput', { GetItemInput: params });
        try {
            const { Item } = await this.DynamoDbClient.send(new client_dynamodb_1.GetItemCommand(params));
            this._log.debug('GetItem: Response.Item', { id, Item });
            if (!Item) {
                if (options.Required) {
                    throw new Error(`Unable to retrieve '${id}' from '${params.TableName}'`);
                }
                return undefined;
            }
            const _item = (0, util_dynamodb_1.unmarshall)(Item);
            item = item.Assign(_item);
            this._log.debug('GetItem: Unmarshalled', { item });
        }
        catch (error) {
            if (error?.name === 'ResourceNotFoundException') {
                this._log.warn('GetItem: ResourceNotFoundException - the Table does not exist', { params, error });
                if (this._debugMode) {
                    const existingTables = await this.ListTables();
                    this._log.debug('Existing Tables', { existingTables });
                }
                if (options.IgnoreTableNotFound !== true) {
                    throw error;
                }
                else {
                    return undefined;
                }
            }
            else {
                this._log.error(`GetItem: ${error.name ?? 'UNKOWN_ERROR'}`, { params, error });
                throw error;
            }
        }
        return item;
    }
    /**
     * TODO: Add support for "Put only if not exists"
     *
     * Add an `IDynamoDbItem` to it's table in `DynamoDb`
     *
     * If the `IDynamoDbItem.Version()` returns a defined value (i.e. not undefined) then the PutItem will ensure
     * that the version of the `item` is the same as the version of the current item in the table before updating it.
     *
     * If the `IDynamoDbItem.Version()` returns a defined value and the Put succeeds, then the `item` passed in will be
     * MODIFED so that it's `Version()` reflects the new version of the item in the table.
     *
     * !!! --------------------------
     *
     * **WARNING: Sometimes when you call PutItem into a Table that does not yet exist and specify to create it, it works,
     *            sometimes DynamoDB says ResourceNotFoundException but when you try again it will work. ¯\_(ツ)_/¯**
     *
     * !!! ---------------------------
     *
     * @param  {IDynamoDbItem} item
     * @returns boolean always returns `true`, or throws an `Error`
     * @see https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html#API_PutItem_Errors
     */
    async PutItem(item, options) {
        let ConditionExpression = undefined;
        let ExpressionAttributeValues = undefined;
        const oldVersion = item.Version();
        if (typeof oldVersion === 'number') {
            if (oldVersion > dynamodb_types_1.DynamoDbVersionedItem.INITIAL_VERSION_NUMBER) {
                // if the version number is >= 0, then we must have pulled a copy of this item from the Database and edited it.
                // In order to ensure someone else isn't doing the same (editing while we are) we restrict the PutItem to only
                // succeed if the version number is the same in the database as it is on this item (i.e. the same as when we
                // read it). We increment the item's version number just before inserting to make sure we get a new version
                // for the next read as well.
                ConditionExpression = 'version = :version';
                ExpressionAttributeValues = (0, util_dynamodb_1.marshall)({
                    ':version': oldVersion,
                });
            }
            else {
                // if the version number is -1 then this is the first time we expect to be inserting this into the database
                // since there won't be an existing item, we can't compare that the version hasn't changed, we need to to
                // ensure that the version attribute wasn't there (i.e. the item didn't exist)
                // This cannot reliably be done with a simple "GetItem" pre-condition call since between the GetItem call
                // and this PutItem the state of the table may have changed.
                ConditionExpression = 'attribute_not_exists(version)';
            }
            item.IncrementVersion();
            this._log.debug(`PutItem: Incremented Version: ${oldVersion} -> ${item.Version()}`);
        }
        const params = {
            TableName: this.GenerateTableName(item),
            Item: (0, util_dynamodb_1.marshall)(item, this._marshallOptions),
            ReturnValues: 'NONE',
            ConditionExpression,
            ExpressionAttributeValues,
        };
        let data;
        try {
            this._log.debug('PutItem:', { TableName: params.TableName, Item: item, PutItemInput: params });
            data = await this.DynamoDbClient.send(new client_dynamodb_1.PutItemCommand(params));
            this._log.debug('PutItemOutput:', { data });
        }
        catch (error) {
            // see: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html#API_PutItem_Errors
            // we need to reset the item version if there was a problem saving it
            if (oldVersion !== undefined) {
                item.Version(oldVersion);
            }
            if (options?.CreateTableIfNotExists) {
                if (!options.Class) {
                    throw new Error('Cannot infer type to create table. Class is required in the options in order to create the table.');
                }
                let existingTables;
                if (error.name === 'ResourceNotFoundException') {
                    existingTables = await this.ListTables();
                    const tableExists = existingTables.find((t) => t === params.TableName) !== undefined;
                    if (tableExists) {
                        this._log.warn('Error while calling PutItem. Cannot try and create a table that already exists so assuming the error is something else...', { existingTables, TableName: params.TableName });
                    }
                    else {
                        this._log.info(`PutItem: TableNotFound (${params.TableName}) ... trying to create it for you...`);
                        await this.InitializeTable(options.Class, existingTables, options?.CreateSchemaOptions);
                        return await this.PutItem(item, { CreateTableIfNotExists: false });
                    }
                }
            }
            this._log.error('PutItem', error);
            throw error;
        }
        return true;
    }
}
exports.DynamoDbClientWrapper = DynamoDbClientWrapper;
//# sourceMappingURL=DynamoDbClientWrapper.js.map