import dotenv from 'dotenv';

dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;

  isSupabase?: boolean;
}

interface RedisConfig {
  host: string;
  port: number;
  password: string;
}

interface OpenAIConfig {
  apiKey: string;
  model?: string;
  embeddingModel?: string;
}

export interface HuggingfaceConfig {
  apiKey: string;
  model?: string;
  provider?:
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
  completionModel?: string;
  vectorDimensions: number;
}

interface JWTConfig {
  secret: string;
  expiresIn: string;
}

interface EnvironmentConfig {
  NODE_ENV: string;
  PORT: number;
  database: DatabaseConfig;
  graphql: {
    path: string;
    playground: boolean;
  };
  redis: RedisConfig;
  huggingface: HuggingfaceConfig;
  jwt: JWTConfig;
  upload: {
    maxFileSize: number;
    allowedMimeTypes: string[];
  };
}

const loadEnvironment = (): EnvironmentConfig => {
  /* Check if is using Supabase or Docker */
  const isSupabase = process.env.DB_HOST?.includes('supabase.co') || false;

  /* Required database variables */
  const requiredVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  /* Check for HuggingFace API key */
  if (!process.env.HF_API_KEY) {
    console.warn('⚠️  HF_API_KEY not set. Embedding generation will fail.');
  }

  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),

    database: {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME!,
      username: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      ssl: process.env.DB_SSL === 'true' || isSupabase,
      isSupabase,
    },

    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD!,
    },

    huggingface: {
      apiKey: process.env.HF_API_KEY || '',
      model: process.env.HF_MODEL || '',
      provider: 'hf-inference',
      completionModel: process.env.HF_COMPLETION_MODEL || '',
      vectorDimensions: parseInt(process.env.VECTOR_DIMENSIONS!, 10) || 1024,
    },

    jwt: {
      secret: process.env.JWT_SECRET || 'change-me-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    graphql: {
      path: process.env.GRAPHQL_PATH || 'graphql',
      playground:
        process.env.GRAPHQL_PLAYGROUND === 'true' || process.env.NODE_ENV === 'development',
    },

    upload: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
      allowedMimeTypes: (
        process.env.ALLOWED_MIME_TYPES || 'application/pdf,text/markdown,text/plain'
      ).split(','),
    },
  };
};

export const env = loadEnvironment();

/* Get database connection URL for TypeORM */
export function getDatabaseUrl(): string {
  const { database } = env;
  const sslParam = database.ssl ? '?sslmode=require' : '';
  return `postgresql://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}${sslParam}`;
}
