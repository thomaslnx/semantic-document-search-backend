import { GraphQLScalarType, Kind } from 'graphql';

/**
 * DateTime scalar for GraphQL
 * Handles Date objects in GraphQL queries and mutations
 */

export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',

  /* Serialize: convert Date to string for GraphQL responses */
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    throw new Error('DateRime scalar can only serialize Date or string values');
  },

  /* ParseValue: convert string to Date from variables */
  parseValue(value: unknown): Date {
    if (typeof value === 'string') {
      return new Date(value);
    }
    if (value instanceof Date) {
      return value;
    }
    throw new Error('DateTime scalar can only parse string or Data values');
  },

  /* ParseLiteral: convert AST node to Date */
  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    throw new Error('DateTime scalar can only parse string literals');
  },
});
