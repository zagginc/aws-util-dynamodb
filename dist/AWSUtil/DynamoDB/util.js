"use strict";
// import { AttributeDefinition } from '@aws-sdk/client-dynamodb';
// /**
//  * Create an {@link AttributeDefinition} from a property on an object by detecting the type
//  * of the property. Only string, number and boolean types are supported. Any other type
//  * will throw an error.
//  *
//  * @param  {string} name
//  * @param  {object} obj
//  * @returns AttributeDefinition
//  */
// export function toAttributeDefinition(name: string, obj: object): AttributeDefinition {
// 	let AttributeType: string;
// 	if ((obj as any)[name] === undefined) {
// 		throw new Error(`Property '${name}' not found in obj: ${JSON.stringify(obj)}`);
// 	}
// 	const _type: string = typeof (obj as any)[name];
// 	switch (_type) {
// 		case 'string': {
// 			AttributeType = 'S';
// 			break;
// 		}
// 		case 'number': {
// 			AttributeType = 'N';
// 			break;
// 		}
// 		case 'boolean': {
// 			AttributeType = 'B';
// 			break;
// 		}
// 		default: {
// 			throw new Error(`Property '${name}' of obj has type '${_type}'. Only string | number | boolean are allowed.`);
// 		}
// 	}
// 	return {
// 		AttributeName: name,
// 		AttributeType,
// 	} as AttributeDefinition;
// }
//# sourceMappingURL=util.js.map