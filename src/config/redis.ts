import { createClient, RedisClientType } from 'redis';
import { env } from './environment.ts';
import { logger } from '../utils/logger.ts';

/**
 * Redis client configuration
 * Used for caching search results and query embeddings
 */
class RedisClient {
  #client: RedisClientType | null = null;
  #isConnected: boolean = false;

  /* Initialize Redis connection */
  async connect(): Promise<void> {
    try {
      this.#client = createClient({
        socket: {
          host: env.redis.host,
          port: env.redis.port,
        },
        password: env.redis.password,
      });

      this.#client.on('error', (err) => {
        logger.error('Redis Client Error: ', err);
        this.#isConnected = false;
      });

      this.#client.on('connect', () => {
        logger.info('Redis Client connecting...');
      });

      this.#client.on('ready', () => {
        logger.info('✅ Redis Client Connected');
        this.#isConnected = true;
      });

      this.#client.on('end', () => {
        logger.info('☎️ Redis Client Disconnected');
        this.#isConnected = false;
      });

      await this.#client.connect();
    } catch (err) {
      logger.error('Failed to connect to the Redis: ', err);
      this.#isConnected = false;

      if (env.NODE_ENV === 'production') {
        throw err;
      }
    }
  }

  /* Get Redis client instance */
  getClient(): RedisClientType | null {
    return this.#client;
  }

  /* Check if Redis is connected */
  isReady(): boolean {
    return this.#isConnected && this.#client?.isReady === true;
  }

  /* Get value from cache */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isReady() || !this.#client) {
      return null;
    }

    try {
      const value = await this.#client.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (err) {
      logger.error(`Error getting cache key ${key}: `, err);
      return null;
    }
  }

  /* Set value in cache */
  async set(key: string, value: any, expirationSeconds?: number): Promise<boolean> {
    if (!this.isReady() || !this.#client) {
      return false;
    }

    try {
      const stringValue = JSON.stringify(value);

      if (expirationSeconds) {
        await this.#client.setEx(key, expirationSeconds, stringValue);
      } else {
        await this.#client.set(key, stringValue);
      }

      return true;
    } catch (err) {
      logger.error(`Error setting cache key ${key}: `, err);
      return false;
    }
  }

  /* Delete key from cache */
  async del(key: string): Promise<boolean> {
    if (!this.isReady() || !this.#client) {
      return false;
    }

    try {
      await this.#client.del(key);
      return true;
    } catch (err) {
      logger.error(`ERror deleting cache key ${key}: `, err);
      return false;
    }
  }

  /* Delete keys matching pattern */
  async delPattern(pattern: string): Promise<number> {
    if (!this.isReady() || !this.#client) {
      return 0;
    }

    try {
      const keys = await this.#client.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      return await this.#client.del(keys);
    } catch (err) {
      logger.error(`Error deleting cache pattern ${pattern}: `, err);
      return 0;
    }
  }

  /* Close Redis connection */
  async close(): Promise<void> {
    if (this.#client) {
      try {
        await this.#client.quit();
        this.#isConnected = false;
        logger.info('Redis connection closed');
      } catch (err) {
        logger.info('Error closing Redis connection: ', err);
      }
    }
  }
}

/* Singleton instance */
export const redisClient = new RedisClient();
