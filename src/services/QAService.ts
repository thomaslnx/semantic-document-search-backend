import { searchService, SearchResult } from './SearchService.ts';
import { openAIService } from './HuggingFaceAIService.ts';
import { logger } from '../utils/logger.ts';

export interface QAAnswer {
  answer: IteratorResult<any, any> | string;
  sources: Array<{
    documentId: string;
    documentTitle: string;
    chunkText: string;
    similarity: number;
  }>;
}

export interface QAOptions {
  maxSources?: number;
  documentId?: string;
}

/**
 * Q&A Service (RAG - Retrieval-Augmented Generation)
 * Answers questions using retrieved document chunks
 */

export class QAService {
  /* Answer a question using RAG */
  async answerQuestion(question: string, options: QAOptions = {}): Promise<QAAnswer> {
    const { maxSources = 5, documentId } = options;

    try {
      /* Retrieve relevant chunks */
      logger.info(`Retrieving relevant chunks for question: ${question}`);
      const searchResults = await searchService.search(question, {
        limit: maxSources,
        documentId: documentId!,
        threshold: 0.7,
      });

      if (searchResults.length === 0) {
        return {
          answer: "I couldn't find relevant information to answer your question.",
          sources: [],
        };
      }

      /* Extract context from search results */
      const context = searchResults.map((result) => result.chunk.chunkText);
      const sources = searchResults.map((result) => ({
        documentId: result.document.id,
        documentTitle: result.document.title,
        chunkText: result.chunk.chunkText.substring(0, 200) + '...', // Truncate for display
        similarity: result.similarity,
      }));

      /* Generate answer using OpenAI */
      logger.info('Generating answer using OpenAI...');
      const answer = await openAIService.generateAnswer(question, context);

      return {
        answer,
        sources,
      };
    } catch (error) {
      logger.error('Error answering question:', error);
      throw new Error(
        `Failed to answer question: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/* Singleton instance */
export const qaService = new QAService();
