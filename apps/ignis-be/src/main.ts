import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { FireSafetyService } from 'apps/fireSafety/src/fire_safety.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for the frontend (adjust origin as needed)
  app.enableCors({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:4000',
    credentials: true,
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize and start the Nest app first so routes/controllers are registered
  await app.listen(port);

  // Now attach Socket.IO to the existing HTTP server used by Nest
  const server = app.getHttpServer();
  const io = new IOServer(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGIN || 'http://localhost:4000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Expose io for controllers/services
  (app as any).set('io', io);
  // Also expose the Socket.IO server on the global object so services can
  // access it without requiring a Nest provider lookup (which throws
  // UnknownElementException when the token isn't registered in the injector).
  (global as any).__io = io;
  // Expose the Nest app instance globally for simple access in controllers
  (global as any).__appInstance = app;

  // If fireSafety service is available, trigger a background precompute of routes
  try {
    const fireService = app.get(FireSafetyService);
    if (fireService && typeof fireService.rebuildAllRoutes === 'function') {
      console.log(
        'Triggering initial rebuildAllRoutes (background, ignoring hazards)',
      );
      // Precompute initial routes ignoring hazards so the evacuation table is populated
      fireService
        .rebuildAllRoutes(true)
        .then((r) => console.log('Initial rebuildAllRoutes done', r))
        .catch((e) => console.warn('Initial rebuildAllRoutes failed', e));
    }
  } catch (e) {
    // ignore if service not available at bootstrap
  }

  console.log(`Listening on http://localhost:${port}`);
}

bootstrap();
