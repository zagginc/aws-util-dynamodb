"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDbExpiringItem = exports.DynamoDbExpiringVersionedItem = exports.DynamoDbVersionedItem = exports.DynamoDbItem = void 0;
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
class DynamoDbItem {
    /**
     * A default constructor is REQUIRED for deserialization from DynamoDB
     * (in deserialization, first the default object is created, then properties are assigned)
     *
     * @param  {number} createdAt default: now
     * @param  {number} updatedAt default: now
     */
    constructor(createdAt = Math.trunc(Date.now() / 1000), updatedAt = Math.trunc(Date.now() / 1000)) {
        this.createdAt = Math.trunc(createdAt);
        this.updatedAt = Math.trunc(updatedAt);
    }
    /**
     * A default implementation of Object.assign(this, ref).
     * Most sub-classes should call super.Assign(ref) in their implementations and then implement any extra
     * functionality (overwriting shallow copies with deep ones, for example).
     *
     * @param  {DynamoDbItem} source the object to copy from
     * @returns DynamoDbItem
     */
    Assign(source) {
        return Object.assign(this, source);
    }
    /**
     * Set the {@link UpdatedAt} date to Date.now()
     */
    MarkUpdated() {
        this.updatedAt = Math.trunc(Date.now() / 1000);
    }
    CreatedAt() {
        return this.createdAt;
    }
    UpdatedAt() {
        return this.updatedAt;
    }
    /**
     * Default implementation defines only the IdFieldName and RangeFieldName as a strings, no other attributes.
     *
     * If you define any {@link GlobalSecondaryIndexes} then you must implement this function to add
     * {@link AttributeDefinition}s for each field you use in your Index key fields.
     * @returns Array<AttributeDefinition>
     */
    AttributeDefinitions() {
        const definitions = [
            // toAttributeDefinition(this.IdFieldName(), this),
            {
                AttributeName: this.IdFieldName(),
                AttributeType: 'S',
            },
        ];
        const rangeFieldName = this.RangeFieldName();
        if (rangeFieldName) {
            // definitions.push(toAttributeDefinition(rangeFieldName, this));
            definitions.push({
                AttributeName: this.RangeFieldName(),
                AttributeType: 'S',
            });
        }
        return definitions;
    }
    /**
     * Default implementation defines only the IdFieldName as a HASH key type and RangeFieldName as RANGE key type, no other keys.
     * @returns Array<KeySchemaElement>
     */
    KeySchema() {
        const definitions = [
            {
                AttributeName: this.IdFieldName(),
                KeyType: 'HASH',
            },
        ];
        const rangeFieldName = this.RangeFieldName();
        if (rangeFieldName) {
            definitions.push({
                AttributeName: rangeFieldName,
                KeyType: 'RANGE',
            });
        }
        return definitions;
    }
    LocalSecondaryIndexes() {
        return undefined;
    }
    GlobalSecondaryIndexes() {
        return undefined;
    }
}
exports.DynamoDbItem = DynamoDbItem;
/**
 * Describes a DynamoDbItem which includes a version number.
 * The version number is used to prevent write collisions when updating the item in DynamoDb.
 *
 * Use this class for a DynamoDbItem which has a versioning implementation included.
 */
class DynamoDbVersionedItem extends DynamoDbItem {
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
    constructor(version = DynamoDbVersionedItem.INITIAL_VERSION_NUMBER, createdAt, updatedAt) {
        super(createdAt, updatedAt);
        this.version = version;
    }
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
    Version(version) {
        if (typeof version === 'number') {
            // SPECIAL CASE: failure to save an item to DynamoDb the first time results in a need to reset the version back to -1.
            if (this.version === 0 && version === DynamoDbVersionedItem.INITIAL_VERSION_NUMBER) {
                this.version = version;
            }
            else if (version < 0) {
                throw new Error('version must be a positive integer');
            }
            else {
                this.version = version;
                this.MarkUpdated();
            }
        }
        return this.version;
    }
    /**
     * Used by {@link DynamoDbClientWrapper.PutItem} to update the version of this item
     * immediately before writing it to DynamoDb.
     *
     * **It's unlikely you want to use this directly**
     *
     * **WARNING: If you return `undefined` from {@link Version} then this function will throw an Error when called**
     */
    IncrementVersion() {
        const v = this.Version();
        if (typeof v === 'undefined') {
            throw new Error('Version is undefined indicating this is not a Versioned item, therefore IncrementVersion is not allowed.');
        }
        return this.Version(v + 1);
    }
    /**
     * Always returns undefined. Override in your implementation if required,
     * or see {@link DynamoDbExpiringVersionedItem}
     */
    ExpiresAt(number) {
        return undefined;
    }
    /**
     * Always returns undefined. Override in your implementation if required,
     * or see {@link DynamoDbExpiringVersionedItem}
     */
    TTLFieldName() {
        return undefined;
    }
}
exports.DynamoDbVersionedItem = DynamoDbVersionedItem;
/**
 * The version number of a new object which has _not_ been inserted into DynamoDb.
 */
DynamoDbVersionedItem.INITIAL_VERSION_NUMBER = -1;
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
class DynamoDbExpiringVersionedItem extends DynamoDbVersionedItem {
    constructor(expiresAt, version, createdAt, updatedAt) {
        super(version, createdAt, updatedAt);
        this.expiresAt = Math.trunc(expiresAt);
    }
    /**
     * The name of the field this class implementation is using to hold the TTL date.
     *
     * @returns string
     */
    TTLFieldName() {
        return 'expiresAt';
    }
    /**
     * Get or Set the date (expressed as seconds since the epoc in UTC) after which this item
     * is no longer valid and should be deleted (expired).
     *
     * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html#time-to-live-ttl-before-you-start-formatting
     *
     * @param  {number} date? if specified, sets the expiry date value, otherwise, return the unmodified expiry date
     * @returns number the date (in seconds since the epoch, UTC) when this item expires
     */
    ExpiresAt(date) {
        if (typeof date !== 'undefined') {
            this.expiresAt = Math.trunc(date);
            this.MarkUpdated();
        }
        return this.expiresAt;
    }
}
exports.DynamoDbExpiringVersionedItem = DynamoDbExpiringVersionedItem;
/**
 * This type is used when the table you are saving the item to has a
 * TTL enabled on it - which automatically deletes items once the
 * current date is past the TTL.
 *
 * Use this class for a DynamoDbItem which has an implementation of expiration included.
 *
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html
 */
class DynamoDbExpiringItem extends DynamoDbItem {
    constructor(expiresAt, createdAt, updatedAt) {
        super(createdAt, updatedAt);
        this.expiresAt = Math.trunc(expiresAt);
    }
    /**
     * The name of the field this class implementation is using to hold the TTL date.
     *
     * @returns string
     */
    TTLFieldName() {
        return 'expiresAt';
    }
    /**
     * Get or Set the date (expressed as seconds since the epoc in UTC) after which this item
     * is no longer valid and should be deleted (expired).
     *
     * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html#time-to-live-ttl-before-you-start-formatting
     *
     * @param  {number} date? if specified, sets the expiry date value, otherwise, return the unmodified expiry date
     * @returns number the date (in seconds since the epoch, UTC) when this item expires
     */
    ExpiresAt(date) {
        if (typeof date !== 'undefined') {
            this.expiresAt = Math.trunc(date);
            this.MarkUpdated();
        }
        return this.expiresAt;
    }
    Version(value) { return undefined; }
    IncrementVersion() {
        throw new Error('Method not implemented.');
    }
}
exports.DynamoDbExpiringItem = DynamoDbExpiringItem;
//# sourceMappingURL=dynamodb-types.js.map