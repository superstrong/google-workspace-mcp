import logger from './logger.js';
import { initializeAccountModule } from '../modules/accounts/index.js';
import { initializeGmailModule } from '../modules/gmail/index.js';
import { initializeCalendarModule } from '../modules/calendar/index.js';
import { initializeDriveModule } from '../modules/drive/index.js';
import { initializeContactsModule } from '../modules/contacts/index.js';
import { registerGmailScopes } from '../modules/gmail/scopes.js';
import { registerCalendarScopes } from '../modules/calendar/scopes.js';
import { registerDriveScopes } from '../modules/drive/scopes.js';
import { CONTACTS_SCOPES } from '../modules/contacts/scopes.js';
import { scopeRegistry } from '../modules/tools/scope-registry.js';

// Function to register contacts scopes
function registerContactsScopes(): void {
  scopeRegistry.registerScope("contacts", CONTACTS_SCOPES.READONLY);
  logger.info('Contacts scopes registered');
}

export async function initializeAllServices(): Promise<void> {
  try {
    // Register all scopes first
    logger.info('Registering API scopes...');
    registerGmailScopes();
    registerCalendarScopes();
    registerDriveScopes();
    registerContactsScopes();

    // Initialize account module first as other services depend on it
    logger.info('Initializing account module...');
    await initializeAccountModule();

    // Initialize remaining services in parallel
    logger.info('Initializing service modules in parallel...');
    await Promise.all([
      initializeDriveModule().then(() => logger.info('Drive module initialized')),
      initializeGmailModule().then(() => logger.info('Gmail module initialized')),
      initializeCalendarModule().then(() => logger.info('Calendar module initialized')),
      initializeContactsModule().then(() => logger.info('Contacts module initialized'))
    ]);

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}
