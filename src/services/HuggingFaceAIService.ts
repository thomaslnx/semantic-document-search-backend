import { InferenceClient } from '@huggingface/inference';
import { env } from '../config/environment.ts';
import { logger } from '../utils/logger.ts';

/**
 * HuggingFace Embeddings Service
 * Handles embedding generation and text completion
 */

/* The correct return type for generateAnswer and generateCompletion functions */
type ChatCompletionIterator = ReturnType<InferenceClient['chatCompletionStream']>;
type ChatCompletionStreamOutput = Awaited<ReturnType<ChatCompletionIterator['next']>>['value'];

export class OpenAIService {
  #client: InferenceClient;
  #completionModel: string;
  #model: string;
  #provider:
    | 'baseten'
    | 'black-forest-labs'
    | 'cerebras'
    | 'clarifai'
    | 'cohere'
    | 'fal-ai'
    | 'featherless-ai'
    | 'fireworks-ai'
    | 'groq'
    | 'hf-inference'
    | 'hyperbolic'
    | 'nebius'
    | 'novita'
    | 'nscale'
    | 'openai'
    | 'ovhcloud'
    | 'publicai'
    | 'replicate'
    | 'sambanova'
    | 'scaleway'
    | 'together'
    | 'wavespeed'
    | 'zai-org'
    | 'auto';

  constructor() {
    if (!env.huggingface.apiKey) {
      throw new Error('HF_API_KEY environment variable is required');
    }

    this.#client = new InferenceClient(env.huggingface.apiKey);
    this.#completionModel = env.huggingface.completionModel!;
    this.#model = env.huggingface.model!;
    this.#provider = 'hf-inference';
  }

  /**
   * Generate embeddings for text
   * Embedding vector (1536 dimensions for text-embedding-3-small)
   */
  async generateEmbedding(text: string): Promise<(number | number[] | number[][])[]> {
    try {
      const response = await this.#client.featureExtraction({
        model: this.#model,
        inputs: text,
        provider: this.#provider,
      });

      const embedding = response;
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
  async generateEmbeddings(texts: string[]): Promise<(number | number[] | number[][])[]> {
    try {
      const response = await this.#client.featureExtraction({
        model: this.#model,
        inputs: texts,
        provider: this.#provider,
      });

      return response.map((item) => item).map((item) => item);
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
  ): Promise<IteratorResult<ChatCompletionStreamOutput, any>> {
    try {
      const chatMessages = systemPrompt
        ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
        : messages;

      const chatResponse = await this.#client.chatCompletionStream({
        model: this.#completionModel,
        provider: 'cerebras',
        messages: chatMessages,
        max_token: 1000,
        temperature: 0.7,
      });

      const content = chatResponse.next();
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
  async generateAnswer(
    question: string,
    context: string[]
  ): Promise<IteratorResult<ChatCompletionStreamOutput, any>> {
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
