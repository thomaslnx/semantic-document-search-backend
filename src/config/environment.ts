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
  password?: string;
}

interface OpenAIConfig {
  apiKey: string;
  model?: string;
  embeddingModel?: string;
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
  openai: OpenAIConfig;
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

  /* Check for OpenAI API key */
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not set. Embedding generation will fail.');
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

    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
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
