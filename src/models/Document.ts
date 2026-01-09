export interface Document {
  id: string;
  title: string;
  filePath?: string | null;
  fileType?: string | null;
  content?: string | null;
  metadata?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentInput {
  title: string;
  filePath?: string | null;
  fileType?: string | null;
  content?: string | null;
  metadata?: string | null;
}

export interface UpdateDocumentInput {
  title: string;
  filePath?: string | null;
  content?: string | null;
  metadata?: string | null;
}
