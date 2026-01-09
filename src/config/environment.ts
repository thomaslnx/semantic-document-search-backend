import dotenv from 'dotenv';

dotenv.config();

interface EnvironmentConfig {
  NODE_ENV: string;
  PORT: number;
  graphql: {
    path: string;
    playground: boolean;
  };
}

const loadEnvironment = (): EnvironmentConfig => {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),

    graphql: {
      path: process.env.GRAPHQL_PATH || 'graphql',
      playground:
        process.env.GRAPHQL_PLAYGROUND === 'true' || process.env.NODE_ENV === 'development',
    },
  };
};

export const env = loadEnvironment();
