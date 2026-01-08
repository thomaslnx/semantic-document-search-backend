import dotenv from 'dotenv';

dotenv.config();

interface EnvironmentConfig {
  NODE_ENV: string;
  PORT: number;
}

const loadEnvironment = (): EnvironmentConfig => {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
  };
};

export const env = loadEnvironment();
