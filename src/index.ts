import 'reflect-metadata';
import http from 'http';
import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import cors from 'cors';
import helmet from 'helmet';

import { env } from './config/environment.ts';
import { logger } from './utils/logger.ts';
import { typeDefs, documentResolver } from './graphql/document/index.ts';
import { initializeDatabase, closeDatabase, AppDataSource } from './config/data-source.ts';

/* Main entrypoint */
async function server(): Promise<void> {
  try {
    /* Initialize database connection */
    logger.info('Initializing database connection...');
    await initializeDatabase();

    const app = express();
    const resolvers = documentResolver;

    const httpServer = http.createServer(app);
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(
      helmet({
        contentSecurityPolicy: env.NODE_ENV === 'production' ? true : false,
      })
    );

    /* Health check endpoint */
    app.get('/health', async (req, res) => {
      try {
        // Check database connection
        const isConnected = AppDataSource.isInitialized;
        res.status(isConnected ? 200 : 503).json({
          status: isConnected ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          database: {
            connected: isConnected,
          },
        });
      } catch (error) {
        logger.error('Health check failed', error);
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed',
        });
      }
    });

    /* Info endpoint */
    app.get('/info', (req, res) => {
      res.json({
        name: 'Semantic Document Search API',
        version: '1.0.0',
        description: 'Semantic Document Search and Q&A System with PGVector',
        status: 'operational',
        timestamp: new Date().toISOString(),
      });
    });

    /* Creating Apollo Server */
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        ...(env.NODE_ENV !== 'production'
          ? [
              ApolloServerPluginLandingPageLocalDefault({
                embed: true,
              }),
            ]
          : [
              ApolloServerPluginLandingPageLocalDefault({
                embed: false,
              }),
            ]),
      ],
      introspection: env.NODE_ENV !== 'production' ? true : false,
    });

    /* Await to Apollo Server starts*/
    await apolloServer.start();

    /* Secure the middlewares */
    app.use(
      '/graphql',
      cors<cors.CorsRequest>({
        origin: env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') || [] : '*',
        credentials: true,
      }),
      expressMiddleware(apolloServer)
    );

    await new Promise<void>((resolve) => {
      httpServer.listen({ port: env.PORT }, resolve);
    });

    logger.info(`🚀 Server up and running on port: ${env.PORT}`);
    logger.info(`📊 GraphQL endpoint: http://localhost:${env.PORT}/graphql`);
    logger.info(`ℹ️  API info: http://localhost:${env.PORT}/info`);
    logger.info(`💊  Health info: http://localhost:${env.PORT}/health`);

    /* Graceful shutdown */
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shuting down gracefully...');
      await apolloServer.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      await apolloServer.stop();
      process.exit(0);
    });
  } catch (err) {
    logger.error(`Theres an error initializing the server!, ${err}`);
    process.exit(1);
  }
}

server();
