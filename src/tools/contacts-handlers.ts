import {
  GetContactsParams,
  GetContactsResponse,
  ContactsError
} from "../modules/contacts/types.js";
import { ContactsService } from "../services/contacts/index.js";
import { validateEmail } from "../utils/account.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { getAccountManager } from "../modules/accounts/index.js";

// Singleton instances - Initialize or inject as per project pattern
let contactsService: ContactsService;
let accountManager: ReturnType<typeof getAccountManager>;

/**
 * Initialize required services.
 * This should likely be integrated into a central initialization process.
 */
async function initializeServices() {
  if (!contactsService) {
    // Assuming ContactsService has a static getInstance or similar
    // or needs to be instantiated here. Using direct instantiation for now.
    contactsService = new ContactsService();
    // If ContactsService requires async initialization await it here.
    // await contactsService.initialize();
  }

  if (!accountManager) {
    accountManager = getAccountManager();
  }
}

/**
 * Handler function for retrieving Google Contacts.
 */
export async function handleGetContacts(
  params: GetContactsParams
): Promise<GetContactsResponse> {
  await initializeServices(); // Ensure services are ready
  const { email, personFields, pageSize, pageToken } = params;

  if (!email) {
    throw new McpError(ErrorCode.InvalidParams, "Email address is required");
  }
  validateEmail(email);

  if (!personFields) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'personFields parameter is required (e.g. "names,emailAddresses")'
    );
  }

  // Use accountManager for token renewal like in Gmail handlers
  return accountManager.withTokenRenewal(email, async () => {
    try {
      const result = await contactsService.getContacts({
        email,
        personFields,
        pageSize,
        pageToken
      });
      return result;
    } catch (error) {
      if (error instanceof ContactsError) {
        // Map ContactsError to McpError
        throw new McpError(
          ErrorCode.InternalError, // Or map specific error codes
          `Contacts API Error: ${error.message}`,
          { code: error.code, details: error.details }
        );
      } else if (error instanceof McpError) {
        // Re-throw existing McpErrors (like auth errors from token renewal)
        throw error;
      } else {
        // Catch unexpected errors
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to get contacts: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
  });
}

// Add other handlers like handleSearchContacts later
