# aws-util-dynamodb

TLDR; Wrapper around DynamoDB to allow for more generic use of DynamoDB without having to know how to use all the APIs.

This library implements a wrapper class around the DynamoDBClient from the AWS SDK. It uses a few interfaces and base classes which you need to implement or extend on your own data models to allow the data models (Classes) to include the structural information needed to build a DynamoDB table to store objects of that Class type in.

It is most useful for the core use case of DynamoDB - fast, easy JSON object storage for objects which are referenced by ID.
If you have more complex use cases with Global or Local Secondary Indexes, or need to do custom serialization/deserialization of data from your Class structure, you may need to use the DynamoDB APIs directly.

For most uses of simple objects, this wrapper should provide an easier developer user experience.

Many advanced use cases are supported via additional types in the library and the options for each function call. They are well documented to review the docs and read the DynamoDB documentation for context on them and when they are useful.

## Usage

For this library, each Class you want to store in DynamoDB maps to a single DynamoDB table. The Class needs to define the two minimal DynamoDB dependencies - the Hash Key (unique ID, also called the Partition Key) and the Range Key (optional, the sort order for the table - also called the Sort key). DynamoDB maps Javascript data types into a native DynamoDB format. For each attribute (a.k.a. column or field) in your Class, DynamoDB needs to know which of it's internal data types to use to store that data.

Fortunately, there are utilities which will convert between the standard Javascript types (string, number, boolean) and DynamoDB data types - this is called 'marshalling' and 'unmarshalling' (a.k.a. serializing / deserializing).

The only two fields which must be manually mapped to DynamoDB data types are the fields used as the Hash Key and Range Key. This is because DynamoDB needs to know those data types to create the table schema before you can insert an object into it.

The `dynamodb-types` file contains Interfaces as well as extendable base implementations for Classes to help ease this data structuring.
It's recommended you extend from `DynamoDbItem`, `DynamoDbExpiringItem`, `DynamoDbVersionedItem` or `DynamoDbExpiringVersionedItem` depending on what combination of Expiration and/or Versioning support you want to leverage for you object (or neither, in the case of `DynamoDbItem`).

You can read the DynamoDB documentation for more info about Expiring and Versioned items but they are basically what they sounds like. DynamoDB will automatically delete Expiring items after a specified expiry date (one of the fields on the item, TTL) and Versioned items provide write-synchronization if you want to be sure the item hasn't changed in DynamoDB between the time you read it and write to it (useful when running multiple read/write operations in parallel on the table).

### Example DynamoDbItem Implementation

```javascript
import { DynamoDbItem } from '@arcticleaf/aws-util-dynamodb';
export class MyDataStructure extends DynamoDbItem {

    // THIS MUST BE A STRING TYPE
    public id: string;
    // --> add any properties here that define your data structure

    /**
     * A default constructor is REQUIRED for deserialization from DynamoDB
     * (in deserialization, first the default object is created, then
     * properties are assigned)
     */
    constructor(id?: string) {
        super();
        this.id = id || '';
    }

    static BaseTableName() : string {
     return 'MyDataStructures';
    }

    // #region IDynamoDbBaseItem
    public IdFieldName() : string {
     return 'id';
    }
    public RangeFieldName() : string | undefined {
     return undefined;
    }
    public BaseTableName() : string {
     return MyClass.BaseTableName();
    }
    // #endregion IDynamoDbBaseItem

}
```

### Example Usage

```javascript
// define TABLE_PREFIX in CloudFormation as `${ProjectName}.${Environment}` to make permissions scoping easier
const TABLE_PREFIX: string = `${process.env.TABLE_PREFIX || 'localhost'}`;
// DynamoDbClientWrapper constructor takes options as well
// you probably want to set a custom Logger in it
const db: DynamoDbClientWrapper = new DynamoDbClientWrapper(TABLE_PREFIX);
const item: MyDataStructure = new MyDataStructure('12345');
await db.PutItem(
    item,
    { CreateTableIfNotExists: true, Class: MyDataStructure },
);
try {
    const retrieved: MyDataStructure | undefined = await db.GetItem(MyDataStructure, item.id);
} catch (err) { ... }
// Alternate Usage: Required - if false, undefined will be returned if the item is not found instead of throwing an exception
const retrieved: MyDataStructure | undefined = await db.GetItem(MyDataStructure, item.id, undefined, { Required: false });
```

## Release Process

1. Make commits that have `fix:` as the prefix on the commit message in order for your fix to trigger a micro version update upon release
2. Commit changes to your branch and then create a PR to merge your branch into **master**
3. Update (merge) into **master**
4. Merge **release** => **master** (in order to pick the last version number deployed)
     * *this may have already been done but it's a safety check*
5. Create a PR to merge **master** => **release**

*Note: this project uses the [semantic-release](https://github.com/semantic-release/semantic-release#readme) system. New releases are automatically created from the **release** branch __ONLY__ if there are commit comments prefixed with `fix:` (micro version bump), `feat:` (minor version bump), `perf:` (major version bump)*
