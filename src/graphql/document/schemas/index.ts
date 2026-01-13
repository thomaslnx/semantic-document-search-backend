export const typeDefs = `#graphql
  scalar DateTime

  type Document {
    id: ID!
    title: String!
    filePath: String
    fileType: String
    content: String
    metadata: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateDocumentInput {
    title: String!
    filePath: String
    fileType: String
    content: String
    metadata: String
  }

  input UpdateDocumentInput {
    title: String
    filePath: String
    fileType: String
    content: String
    metadata: String
  }

  type Query {
    """ list all documents """
    getDocuments: [Document!]!

    """ Retrieve one document based on its Id """
    getDocument(id: ID!): Document
  }

  type Mutation {
    """ Create a new document """
    createDocument(input: CreateDocumentInput!): Document!

    """ Update a document """
    updateDocument(id: ID!, input: UpdateDocumentInput!): Document

    """ Delete a document """
    deleteDocument(id: ID!): Boolean!
  }
`;
