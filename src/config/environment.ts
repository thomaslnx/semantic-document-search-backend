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

interface EnvironmentConfig {
  NODE_ENV: string;
  PORT: number;
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
    isSupabase: boolean;
  };
  graphql: {
    path: string;
    playground: boolean;
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

  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),

    database: {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.PORT || '5432', 10),
      database: process.env.DB_NAME!,
      username: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      ssl: process.env.DB_SSL === 'true' || isSupabase,
      isSupabase,
    },

    graphql: {
      path: process.env.GRAPHQL_PATH || 'graphql',
      playground:
        process.env.GRAPHQL_PLAYGROUND === 'true' || process.env.NODE_ENV === 'development',
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
