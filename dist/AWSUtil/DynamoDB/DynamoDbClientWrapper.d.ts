import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { CreateTableInput, TableDescription, AttributeValue, StreamSpecification, BillingMode, Tag, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import type { marshallOptions } from '@aws-sdk/util-dynamodb';
import { LambdaLogOptions } from 'lambda-log';
import { IDynamoDbItem, IDynamoDbBasicItemConstructor } from './dynamodb-types';
export declare const DEFAULT_TABLE_PREFIX: string;
export interface AttributeValueMap {
    [key: string]: AttributeValue;
}
export type ExpressionAttributeValues = {
    [key: string]: string | number | boolean;
};
/**
 * Get a copy of the defaul `marshalOptions` used if none are provided to the
 * `DynamoDbClientWrapper` constructor. This function's use case is if you want
 * to start with the default options and edit vs create your own from scratch.
 * @returns marshallOptions
 */
export declare function GetDefaultMarshallOptions(): marshallOptions;
type ConsoleLogFunction = (message?: any, ...optionalParams: any[]) => void;
export type ConsoleLoggerLike = Record<'error' | 'warn' | 'info' | 'debug' | 'log', ConsoleLogFunction>;
export interface ICreateSchemaOptions {
    BillingMode?: BillingMode | string;
    StreamSpecification?: StreamSpecification;
    Tags?: Tag[];
}
export interface IScanOrQueryOptions extends IGetItemOptions {
    Limit?: number;
    /**
     * This is appended to the end of the internally composed FilterExpression for this Scan.
     * It is appended with ` AND `.
     *
     * @see {@link ScanInput.FilterExpression}
     */
    FilterExpression?: string;
    /**
     * Used in combination with the {@link FilterExpression} to replace named values in the expression with values.
     *
     * @see {@link ScanInput.ExpressionAttributeValues}
     */
    ExpressionAttributeValues?: ExpressionAttributeValues;
    /**
     * Start the Scan from this key.
     * @see {@link ScanInput.ExclusiveStartKey}
     */
    ExclusiveStartKey?: string | number | boolean;
}
/**
 * Options for {@link DynamoDbClientWrapper.Query}
 */
export interface IQueryOptions extends IScanOrQueryOptions {
    /**
     * @see {@link QueryInput.ScanIndexForward}
     */
    ScanIndexForward?: boolean;
}
/**
 * Options for {@link DynamoDbClientWrapper.Scan}
 */
export interface IScanOptions extends IScanOrQueryOptions {
}
/**
 * Options for {@link DynamoDbClientWrapper.GetItems}
 */
export type IGetItemsOptions = IQueryOptions | IScanOptions;
export interface IGetItemOptions {
    /**
     * Set to `true` if you want an Error thrown when an Item is not found.
     *
     * By default, `undefined` is returned.
     */
    Required?: boolean;
    /**
     * Determines the read consistency model:  If set to `true`, then the operation uses
     * _strongly consistent_ reads; otherwise, the operation uses _eventually consistent_ reads.
     *
     * {@link GetItemInput.ConsistentRead}
     *
     * **WARNING**: Not supported if you use a secondary index ({@link IndexName}).
     */
    ConsistentRead?: boolean;
    /**
     * If you want to read from a secondary index, define the name of the index to read from here.
     *
     * **@see {@link IndexPartitionKeyFieldName} and {@link IndexRangeFieldName}**
     */
    IndexName?: string;
    /**
     * The name of the Partition Key Field to use when Scanning a secondary index (i.e. when you also set {@link IndexName})).
     *
     * If your Partition Key Field name for the {@link IndexName} you define is _not_ the same as the `IdFieldName()`
     * you defined on your type, you **MUST** set this option.
     */
    IndexPartitionKeyFieldName?: string;
    /**
     * The name of the Range Field to use when Scanning a secondary index (i.e. when you also set {@link IndexName}))
     *
     * If your Range Key Field name for the {@link IndexName} you define is _not_ the same as the `RangeFieldName()`
     * you defined on your type, you **MUST** set this option.
     */
    IndexRangeFieldName?: string;
    /**
     * Direct the GetItem call to return undefined instead of throwing a
     * `ResourceNotFoundException` if you attempt to read an Item from a
     * Table that doesn't exist.
     */
    IgnoreTableNotFound?: boolean;
}
/**
 * Configure the {@link PutItem} call to self-correct for common issues such as
 * the first time you try to save an item (table doesn't exist).
 */
export interface IPutItemOptions<T extends IDynamoDbItem> {
    /**
     * Set to `true` to attempt to create the Table if none exists for the item you are trying to save.
     */
    CreateTableIfNotExists?: boolean;
    /**
     * The options to use for the {@link InitializeTable} call if {@link CreateIfNotExists} is `true`.
     * Ignored if {@link CreateIfNotExists} is `false`.
     */
    CreateSchemaOptions?: ICreateSchemaOptions;
    /**
     * The class to use for constructing the new Table if it's needed
     */
    Class?: IDynamoDbBasicItemConstructor<T>;
}
export interface IDynamoDbClientWrapperOptions {
    MarshallOptions?: marshallOptions;
    /**
     * Provide a specific logger for this library to use.
     * If this is defined, {@link LogOptions} is ignored.
     */
    Logger?: ConsoleLoggerLike;
    /**
     * Allows the caller to define specific options to this class to instantiate it's logger from.
     * Ignored if {@link Logger} is provided
     */
    LogOptions?: LambdaLogOptions;
    /**
     * Allow the caller to pass-through custom options to use when instantiate
     * the underlying DynamoDB Client.
     */
    DynamoDBClientConfig?: DynamoDBClientConfig;
    /**
     * Enable extra logging including extra inspection of state of DynamoDb tables.
     * Pretty much all exceptions are logged (even when re-thrown) with this enabled.
     * !!! WARNING: Error handling can be MUCH slower with this enabled so performance may not reflect production
     */
    DebugMode?: boolean;
    /**
     * Set the number of MILLISECONDS to pause after a newly created Table reports itself as "ACTIVE".
     * PutItem calls fail immediately after a Table reports as ACTIVE - this allow customization of the delay
     * period.
     */
    DelayAfterCreateTable?: number;
}
/**
 *
 */
export declare class DynamoDbClientWrapper {
    private _dbClient;
    private _tablePrefix;
    private _marshallOptions;
    private _dynamoDBClientConfig;
    private _log;
    private _debugMode;
    private _delayAfterCreateTable;
    /**
     * @param tablePrefix appended to the begining of all table names created or accessed by this class.
     * Use this to namespace your tables. Default Value: `process.env.TABLE_PREFIX`
     * @param options optional configuration for this class for things such as logging, debug, or passing through configuration to the underlying DynamoDB client
     */
    constructor(tablePrefix?: string, options?: IDynamoDbClientWrapperOptions);
    /**
     * If you need to execute raw DynamoDb operations not covered by this warapper, you can obtain
     * the instantiated DynamoDb client here. It is more performant to re-use the client than create
     * a new one.
     * @returns DynamoDBClient
     */
    get DynamoDbClient(): DynamoDBClient;
    get TablePrefix(): string | undefined;
    set TablePrefix(prefix: string | undefined);
    /**
     * Internal function to create and wrap the underlying DynamoDB client with XRay tracing
     */
    private _createDbClient;
    /**
     * Destroys the underlying DynamoDB client freeing up any resources or sockets it may be using.
     * @see {@link DynamoDBClient.destroy}
     */
    Destroy(): void;
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
    GenerateTableName(item: IDynamoDbItem | string): string;
    /**
     * This is public to provide for advanced usage, but likely you just want to call `InitializeTable`
     * which will use this function as part of the table creation process.
     *
     * @param  {IDynamoDbItem} type
     * @returns CreateTableInput
     */
    CreateSchema(type: IDynamoDbItem, options?: ICreateSchemaOptions): CreateTableInput;
    /**
     * Get a list of all the tables avaialble on DynamoDb.
     *
     * Typically you would use the output of this to search for the existance of a
     * specific table as it's faster to ListTables than to Describe them all.
     *
     * @returns Promise<string[]> a list of the Table Names for all the tables on DynamoDb
     */
    ListTables(): Promise<string[]>;
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
    InitializeTable<T extends IDynamoDbItem>(Type: IDynamoDbBasicItemConstructor<T>, existingTables?: string[], options?: ICreateSchemaOptions): Promise<void>;
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
    CreateTableIfNotExists(input: CreateTableInput, waitForActive?: boolean, ttlAttributeName?: string): Promise<TableDescription | undefined>;
    /**
     * Delegate to the DynamoDB {@link DescribeTableCommand}
     * If the table does not exist, `undefined` will be returned.
     *
     * @param  {string} tableName
     * @returns TableDescription
     */
    DescribeTable(tableName: string): Promise<TableDescription | undefined>;
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
    CreateTable(input: CreateTableInput, waitForActive?: boolean, ttlAttributeName?: string): Promise<TableDescription | undefined>;
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
    UpdateTable<T extends IDynamoDbItem>(item: T): Promise<TableDescription | undefined>;
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
    private _CreateKeyMapping;
    /**
     * @param  {IDynamoDbBasicItemConstructor<T>} Type
     * @param  {string|number} id
     * @param  {string|number|boolean} range?
     * @param  {ReturnValue=NONE} returnValue Allowed Values: NONE | ALL_OLD
     * @returns Promise<T | boolean> if returnValue is "ALL_OLD" then the deleted item will be returned after
     *                               being deserialized into the provided Type. Otherwise, a boolean will be
     *                               returned indicating success or failure of the operation.
     */
    DeleteItem<T extends IDynamoDbItem>(Type: IDynamoDbBasicItemConstructor<T>, id: string | number, range?: string | number | boolean, returnValue?: 'NONE' | 'ALL_OLD'): Promise<T | boolean>;
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
    GetItems<T extends IDynamoDbItem>(type: IDynamoDbBasicItemConstructor<T>, id?: string | number, range?: string | number | boolean, options?: IGetItemsOptions): Promise<T[]>;
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
    Scan<T extends IDynamoDbItem>(Type: IDynamoDbBasicItemConstructor<T>, id?: string | number, range?: string | number | boolean, options?: IScanOptions): Promise<T[]>;
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
    Query<T extends IDynamoDbItem>(Type: IDynamoDbBasicItemConstructor<T>, id: string | number, range?: string | number | boolean, options?: IQueryOptions): Promise<T[]>;
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
    GetItem<T extends IDynamoDbItem>(Type: IDynamoDbBasicItemConstructor<T>, id: string | number, range?: string | number | boolean, options?: IGetItemOptions): Promise<T | undefined>;
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
    PutItem<T extends IDynamoDbItem>(item: T, options?: IPutItemOptions<T>): Promise<boolean>;
}
export {};
//# sourceMappingURL=DynamoDbClientWrapper.d.ts.map