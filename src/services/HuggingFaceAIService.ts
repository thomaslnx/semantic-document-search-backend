import { InferenceClient } from '@huggingface/inference';
import { env } from '../config/environment.ts';
import { logger } from '../utils/logger.ts';

import { HuggingFaceAPIError, EmbeddingGenerationError } from '../errors/DomainErrors.ts';
import { handleExternalAPIError, logError } from '../utils/errorHandler.ts';

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
      throw new HuggingFaceAPIError(
        'HF_API_KEY environment variable is required. Please configure your Hugging Face API key.'
      );
    }

    this.#client = new InferenceClient(env.huggingface.apiKey);
    this.#completionModel = env.huggingface.completionModel!;
    this.#model = env.huggingface.model!;
    this.#provider = 'hf-inference';
  }

  /**
   * Generate embeddings for text
   * Embedding vector (1024 dimensions for intfloat/multilingual-e5-large)
   */
  async generateEmbedding(text: string): Promise<(number | number[] | number[][])[]> {
    if (!text || text.trim().length === 0) {
      throw new EmbeddingGenerationError('Text input cannot be empty');
    }

    try {
      const response = await this.#client.featureExtraction({
        model: this.#model,
        inputs: text,
        provider: this.#provider,
      });

      const embedding = response;
      if (!embedding) {
        throw new EmbeddingGenerationError('No embedding returned from Hugging Face API');
      }

      return embedding;
    } catch (err) {
      const appError = handleExternalAPIError('Hugging Face', err, 'generateEmbedding');

      /* If it's already an AppError, re-throw with more context */
      if (appError instanceof HuggingFaceAPIError) {
        throw appError;
      }

      logger.error('Error generating embedding:', err);

      throw new EmbeddingGenerationError(
        'Failed to generate embedding',
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Generate embeddings for multiple texts
   * Array of embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<(number | number[] | number[][])[]> {
    if (!texts || texts.length === 0) {
      throw new EmbeddingGenerationError('Texts array cannot be empty');
    }

    /* Validate all texts */
    const emptyTexts = texts.filter((t) => !t || t.trim().length === 0);
    if (emptyTexts.length > 0) {
      throw new EmbeddingGenerationError(`${emptyTexts.length} text(s) in the array are empty`);
    }

    try {
      const response = await this.#client.featureExtraction({
        model: this.#model,
        inputs: texts,
        provider: this.#provider,
      });

      if (!response || !Array.isArray(response)) {
        throw new EmbeddingGenerationError('Invalid response format from Hugging Face API');
      }

      if (response.length !== texts.length) {
        throw new EmbeddingGenerationError(
          `Expected ${texts.length} embeddings, but received ${response.length}`
        );
      }

      return response.map((item) => item).map((item) => item);
    } catch (err) {
      const appError = handleExternalAPIError('Hugging Face', err, 'generateEmbeddings');

      if (appError instanceof HuggingFaceAPIError) {
        throw appError;
      }

      logger.error('Error generating embeddings:', err);
      throw new EmbeddingGenerationError(
        'Failed to generate embeddings',
        err instanceof Error ? err : undefined
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
    if (!messages || messages.length === 0) {
      throw new HuggingFaceAPIError('Messages array cannot be empty');
    }

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
        throw new HuggingFaceAPIError('No completion returned from Hugging Face API');
      }

      return content;
    } catch (err) {
      const appError = handleExternalAPIError('Hugging Face', err, 'generateCompletion');

      if (appError instanceof HuggingFaceAPIError) {
        throw appError;
      }

      logger.error('Error generating completion:', err);
      throw new HuggingFaceAPIError(
        'Failed to generate completion',
        err instanceof Error ? err : undefined
      );
    }
  }

  /* Generate answer using RAG (Retrieval-Augmented Generation) */
  async generateAnswer(
    question: string,
    context: string[]
  ): Promise<IteratorResult<ChatCompletionStreamOutput, any>> {
    if (!question || question.trim().length === 0) {
      throw new HuggingFaceAPIError('Question cannot be empty');
    }

    if (!context || context.length === 0) {
      throw new HuggingFaceAPIError('Context array cannot be empty');
    }

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
