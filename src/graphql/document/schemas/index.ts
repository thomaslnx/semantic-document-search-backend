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

  type DocumentChunk {
    id: ID!
    documentId: ID!
    chunkText: String!
    chunkIndex: Int!
    metadata: String
    createdAt: DateTime!
  }

  type SearchResult {
    chunk: DocumentChunk!
    document: Document!
    similarity: Float!
    score: Float!
  }

  type QASource {
    documentId: ID!
    documentTitle: String!
    chunkText: String!
    similarity: Float!
  }

  type QAAnswer {
    answer: String!
    sources: [QASource!]!
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

  input SearchInput {
    query: String!
    limit: Int
    threshold: Float
    documentId: ID
    hybrid: Boolean
  }

  input QAInput {
    question: String!
    maxSources: Int
    documentId: ID
  }

  type Query {
    """ list all documents """
    getDocuments: [Document!]!

    """ Retrieve one document based on its Id """
    getDocument(id: ID!): Document

    """ Perform semantic search """
    search(input: SearchInput!): [SearchResult!]!

    """ Answer a question using RAG """
    answerQuestion(input: QAInput!): QAAnswer!
  }

  type Mutation {
    """ Create a new document """
    createDocument(input: CreateDocumentInput!): Document!

    """ Update a document """
    updateDocument(id: ID!, input: UpdateDocumentInput!): Document

    """ Delete a document """
    deleteDocument(id: ID!): Boolean!

    """ Perform semantic search """
    search(input: SearchInput!): [SearchResult!]!

    """ Upload and process a document file """
    uploadDocument(file: Upload!): Document!
  }
`;
