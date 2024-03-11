import type { AttributeDefinition, GlobalSecondaryIndex, KeySchemaElement, LocalSecondaryIndex } from '@aws-sdk/client-dynamodb';
export type IDynamoDbBasicItemConstructor<T extends IDynamoDbBasicItem> = new (...args: any[]) => T;
/**
 * The most basic requirements of a generic Class for an item to be stored in DynamoDb.
 * This interface creates a "self-describing" pattern such that the class itself describes
 * it's schema definition.
 *
 * It is generally recommended that class implementors of this interface create static
 * functions which implement these methods and then delegate the implementation of the
 * interface signature methods to call the static functions.
 *
 * @see https://aws.amazon.com/blogs/database/choosing-the-right-dynamodb-partition-key/
 */
export interface IDynamoDbBasicItem {
    /**
     * Copy the values from 'ref' into this object and return a reference to this object.
     * Most implementations will likely just need a simple Object.assign(...) to do a shallow
     * copy, however if implementations need more advanced copy capabilities such as deep copies
     * or handling internal data structure validation, this provides the ability for the implementation
     * to define that.
     */
    Assign(source: IDynamoDbBasicItem): IDynamoDbBasicItem;
    /**
     * Get the name of the field which stores the unique ID for this Item
     * (also known as the `hash` key or `partition` key)
     *
     * @returns string
     */
    IdFieldName(): string;
    /**
     * Get the name of the field which stores the range (or `sort`) key to be used for this item
     *
     * @returns string
     */
    RangeFieldName(): string | undefined;
    /**
     * The base DynamoDb table name for this type.
     * This value may be prefixed or suffixed so it should not be expected to be
     * verbatim what appears in DynmoDb, however it provides a way for this Item
     * implementation to self-describe it's collection.
     *
     * @returns string
     */
    BaseTableName(): string;
    /**
     * Must return the AttributeDefinitions required to properly store this item type in the DynamoDb table.
     * Implementations must at least define the AttributeDefinition for the Id field (see: IdFieldName())
     * and any fields that are part of a Key.
     *
     * @returns Array<AttributeDefinition>
     */
    AttributeDefinitions(): Array<AttributeDefinition>;
    /**
     * Define the HASH and/or RANGE key(s) for this Item's table definition.
     * Every table MUST have a HASH key defined (usually the IdFieldName()) aand MAY define RANGE keys.
     * RANGE keys should be defined when Queries expected to be required which filter on the RANGE key values.
     *
     * @returns Array<KeySchemaElement>
     */
    KeySchema(): Array<KeySchemaElement>;
    /**
     * Define any required {@link LocalSecondaryIndex}
     *
     * NOTE: If you define LocalSecondaryIndexes you must also override {@link AttributeDefinitions}
     * to add in the definitions for the keys required for your index.
     */
    LocalSecondaryIndexes(): Array<LocalSecondaryIndex> | undefined;
    /**
     * Define any required {@link GlobalSecondaryIndex}
     *
     * NOTE: If you define GlobalSecondaryIndexes you must also override {@link AttributeDefinitions}
     * to add in the definitions for the keys required for your index.
     */
    GlobalSecondaryIndexes(): Array<GlobalSecondaryIndex> | undefined;
}
/**
 * Most classes that want to save themselves in DynamoDb probably want to implement this interface.
 * Even if you want to cover only features of the more specific interfaces, it's probably easier to
 * implement this interface and then return undefined (as documented) for implementations of functions
 * which indicate the lack of support for the features you don't need.
 */
export type IDynamoDbItem = IDynamoDbBasicItem & IDynamoDbExpiringItem & IDynamoDbVersionedItem;
/**
 * Encapsulates a generic Item which includes created & updated timestamps.
 * Implementations should return undefined from TTLFieldName to disable expiration support.
 * Implementations should return undefined from Version to disable versioning support.
 *
 * !!! WARNING !!!
 * Implementations of this class must call MarkUpdated() whenever there is a
 * WRITE operation on the values in the class if that operation is intended to
 * be recorded as an 'update' (otherwise the updated date will not change).
 */
export declare abstract class DynamoDbItem implements IDynamoDbItem {
    protected createdAt: number;
    protected updatedAt: number;
    /**
     * A default constructor is REQUIRED for deserialization from DynamoDB
     * (in deserialization, first the default object is created, then properties are assigned)
     *
     * @param  {number} createdAt default: now
     * @param  {number} updatedAt default: now
     */
    constructor(createdAt?: number, updatedAt?: number);
    /**
     * A default implementation of Object.assign(this, ref).
     * Most sub-classes should call super.Assign(ref) in their implementations and then implement any extra
     * functionality (overwriting shallow copies with deep ones, for example).
     *
     * @param  {DynamoDbItem} source the object to copy from
     * @returns DynamoDbItem
     */
    Assign(source: DynamoDbItem): DynamoDbItem;
    /**
     * Set the {@link UpdatedAt} date to Date.now()
     */
    MarkUpdated(): void;
    CreatedAt(): number;
    UpdatedAt(): number;
    abstract IdFieldName(): string;
    abstract RangeFieldName(): string | undefined;
    abstract BaseTableName(): string;
    /**
     * Default implementation defines only the IdFieldName and RangeFieldName as a strings, no other attributes.
     *
     * If you define any {@link GlobalSecondaryIndexes} then you must implement this function to add
     * {@link AttributeDefinition}s for each field you use in your Index key fields.
     * @returns Array<AttributeDefinition>
     */
    AttributeDefinitions(): Array<AttributeDefinition>;
    /**
     * Default implementation defines only the IdFieldName as a HASH key type and RangeFieldName as RANGE key type, no other keys.
     * @returns Array<KeySchemaElement>
     */
    KeySchema(): Array<KeySchemaElement>;
    abstract TTLFieldName(): string | undefined;
    abstract ExpiresAt(number?: number): number | undefined;
    abstract Version(value?: number): number | undefined;
    abstract IncrementVersion(): number;
    LocalSecondaryIndexes(): Array<LocalSecondaryIndex> | undefined;
    GlobalSecondaryIndexes(): Array<GlobalSecondaryIndex> | undefined;
}
/**
 * A DynamoDbItem which will be automatically deleted from it's table after a given expiry date.
 */
export interface IDynamoDbExpiringItem extends IDynamoDbBasicItem {
    /**
     * The name of the field this class implementation is using to hold the TTL date.
     * Return undefined to disable the TTL (automatic expiry of items) for this item type.
     *
     * @returns string
     */
    TTLFieldName(): string | undefined;
    /**
     * Get or Set the date (expressed as seconds since the epoc in UTC) after which this item
     * is no longer valid and should be deleted (expired).
     *
     * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html#time-to-live-ttl-before-you-start-formatting
     *
     * This is only relevant if the TTLFieldName returns a string, otherwise implementors may
     * return undefined for this function's implementation.
     *
     * @param  {number} date? if specified, sets the expiry date value, otherwise, return the unmodified expiry date
     * @returns number the date (in sec since the epoch, UTC) when this item expires
     */
    ExpiresAt(number?: number): number | undefined;
}
/**
 * A DynamoDbItem which includes a version number to be used on write operations to
 * avoid multiple parties overwriting the same item without realizing it has changed.
 */
export interface IDynamoDbVersionedItem extends IDynamoDbBasicItem {
    /**
     * Get or Set the Version of this Item
     * Note: it is safer to use IncrementVersion rather than setting the version number directly.
     *
     * To disable version checking on an item that implements this interface, return undefined
     *
     * @param  {number} value?
     * @returns number
     */
    Version(value?: number): number | undefined;
    /**
     * Increment the current version number by 1.
     * If Version() returns undefined, the caller of this function should assume the value
     * it returns is irrelevant.
     */
    IncrementVersion(): number;
}
/**
 * Describes a DynamoDbItem which includes a version number.
 * The version number is used to prevent write collisions when updating the item in DynamoDb.
 *
 * Use this class for a DynamoDbItem which has a versioning implementation included.
 */
export declare abstract class DynamoDbVersionedItem extends DynamoDbItem implements IDynamoDbVersionedItem {
    /**
     * The version number of a new object which has _not_ been inserted into DynamoDb.
     */
    static readonly INITIAL_VERSION_NUMBER: number;
    /**
     * The _DynamoDb_ version number of this item.
     * This is used to prevent write collisions with multiple reader/writers and
     * will get automatically updated by {@link DynamoDbClientWrapper.PutItem}.
     */
    protected version: number;
    /**
     * By default, a new instance is created with a version of {@link DynamoDbVersionedItem.INITIAL_VERSION_NUMBER},
     * updated & created as 'now'.
     *
     * It's **unlikely** you want to create a NEW object with non-default values.
     *
     * @param  {number} version default: {@link DynamoDbVersionedItem.INITIAL_VERSION_NUMBER}
     * @param  {number} createdAt? default: now
     * @param  {number} updatedAt? default: now
     */
    constructor(version?: number, createdAt?: number, updatedAt?: number);
    /**
     * Get/Set the version number on this item.
     * !!! WARNING !!!
     * Typically you would NOT change the version number manually.
     * When using PutItem with a conditional check for version number, DynamoDb will fail if
     * the version in the database is different than this version. The ability to set this
     * version number directly is provided to allow {@link DynamoDbClientWrapper.PutItem} to
     * handle failure cases when saving the Item.
     *
     * {@link DynamoDbClientWrapper.PutItem} essentially does:
     * ```
     *  oldVersion = Version()
     *  IncrementVersion()
     *  ...try to save item...
     *  on failure, Version(oldVersion)
     * ```
     *
     * @param  {number} version?
     * @returns number
     */
    Version(version?: number): number | undefined;
    /**
     * Used by {@link DynamoDbClientWrapper.PutItem} to update the version of this item
     * immediately before writing it to DynamoDb.
     *
     * **It's unlikely you want to use this directly**
     *
     * **WARNING: If you return `undefined` from {@link Version} then this function will throw an Error when called**
     */
    IncrementVersion(): number;
    /**
     * Always returns undefined. Override in your implementation if required,
     * or see {@link DynamoDbExpiringVersionedItem}
     */
    ExpiresAt(number?: number): number | undefined;
    /**
     * Always returns undefined. Override in your implementation if required,
     * or see {@link DynamoDbExpiringVersionedItem}
     */
    TTLFieldName(): string | undefined;
}
/**
 * This type is used when you require versioning on your item AND the table you are saving
 * the item to has a TTL enabled on it - which automatically deletes items once the
 * current date is past the TTL.
 *
 * Use this class for a DynamoDbItem which has an implementation of expiration included.
 *
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html
 * @see {@link DynamoDbExpiringItem}
 */
export declare abstract class DynamoDbExpiringVersionedItem extends DynamoDbVersionedItem implements IDynamoDbExpiringItem {
    /**
     * Used as the `TTL` property by DynamoDb to auto-expire (delete) this item.
     */
    protected expiresAt: number;
    constructor(expiresAt: number, version?: number, createdAt?: number, updatedAt?: number);
    /**
     * The name of the field this class implementation is using to hold the TTL date.
     *
     * @returns string
     */
    TTLFieldName(): string;
    /**
     * Get or Set the date (expressed as seconds since the epoc in UTC) after which this item
     * is no longer valid and should be deleted (expired).
     *
     * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html#time-to-live-ttl-before-you-start-formatting
     *
     * @param  {number} date? if specified, sets the expiry date value, otherwise, return the unmodified expiry date
     * @returns number the date (in seconds since the epoch, UTC) when this item expires
     */
    ExpiresAt(date?: number): number;
}
/**
 * This type is used when the table you are saving the item to has a
 * TTL enabled on it - which automatically deletes items once the
 * current date is past the TTL.
 *
 * Use this class for a DynamoDbItem which has an implementation of expiration included.
 *
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html
 */
export declare abstract class DynamoDbExpiringItem extends DynamoDbItem implements IDynamoDbExpiringItem {
    /**
     * Used as the `TTL` property by DynamoDb to auto-expire (delete) this item.
     */
    protected expiresAt: number;
    constructor(expiresAt: number, createdAt?: number, updatedAt?: number);
    /**
     * The name of the field this class implementation is using to hold the TTL date.
     *
     * @returns string
     */
    TTLFieldName(): string;
    /**
     * Get or Set the date (expressed as seconds since the epoc in UTC) after which this item
     * is no longer valid and should be deleted (expired).
     *
     * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html#time-to-live-ttl-before-you-start-formatting
     *
     * @param  {number} date? if specified, sets the expiry date value, otherwise, return the unmodified expiry date
     * @returns number the date (in seconds since the epoch, UTC) when this item expires
     */
    ExpiresAt(date?: number): number;
    Version(value?: number): number | undefined;
    IncrementVersion(): number;
}
//# sourceMappingURL=dynamodb-types.d.ts.map