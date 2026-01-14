import OpenAI from 'openai';
import { env } from '../config/environment.ts';
import { logger } from '../utils/logger.ts';

/**
 * OpenAI Service
 * Handles embedding generation and text completion
 */

export class OpenAIService {
  #client: OpenAI;
  #embeddingModel: string;
  #completionModel: string;

  constructor() {
    if (!env.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.#client = new OpenAI({
      apiKey: env.openai.apiKey,
    });

    this.#embeddingModel = env.openai.embeddingModel || 'text-embedding-3-small';
    this.#completionModel = env.openai.model || 'gpt-4o-mini';
  }

  /**
   * Generate embeddings for text
   * Embedding vector (1536 dimensions for text-embedding-3-small)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.#client.embeddings.create({
        model: this.#embeddingModel,
        input: text,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI');
      }

      return embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw new Error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embeddings for multiple texts
   * Array of embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.#client.embeddings.create({
        model: this.#embeddingModel,
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      logger.error('Error generating embeddings:', error);
      throw new Error(
        `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate completion using OpenAI Chat API
   */
  async generateCompletion(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    systemPrompt?: string
  ): Promise<string> {
    try {
      const chatMessages = systemPrompt
        ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
        : messages;

      const response = await this.#client.chat.completions.create({
        model: this.#completionModel,
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No completion returned from OpenAI');
      }

      return content;
    } catch (error) {
      logger.error('Error generating completion:', error);
      throw new Error(
        `Failed to generate completion: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /* Generate answer using RAG (Retrieval-Augmented Generation) */
  async generateAnswer(question: string, context: string[]): Promise<string> {
    const systemPrompt = `You are a helpful assistant that answers questions based on the provided context.
      Use only the information from the context to answer the question.
      If the context doesn't contain enough information to answer the question, say so.
      Be concise and accurate.`;

    const contextText = context.join('\n\n---\n\n');

    const userMessage = `Context:\n${contextText}\n\nQuestion: ${question}\n\nAnswer:`;

    return this.generateCompletion([{ role: 'user', content: userMessage }], systemPrompt);
  }
}

/* Singleton instance */
export const openAIService = new OpenAIService();
