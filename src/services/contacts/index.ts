import { google } from "googleapis";
import {
  BaseGoogleService,
  GoogleServiceError
} from "../base/BaseGoogleService.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  GetContactsParams,
  GetContactsResponse,
  ContactsError
} from "../../modules/contacts/types.js";
import { CONTACTS_SCOPES } from "../../modules/contacts/scopes.js";

// Type alias for the Google People API client
type PeopleApiClient = ReturnType<typeof google.people>;

/**
 * Contacts service implementation extending BaseGoogleService.
 * Handles Google Contacts (People API) specific operations.
 */
export class ContactsService extends BaseGoogleService<PeopleApiClient> {
  constructor() {
    super({
      serviceName: "people", // Use 'people' for the People API
      version: "v1"
    });
    // Initialize immediately or ensure initialized before first use
    this.initialize();
  }

  /**
   * Gets an authenticated People API client for the specified account.
   */
  private async getPeopleClient(email: string): Promise<PeopleApiClient> {
    // The clientFactory function tells BaseGoogleService how to create the specific client
    return this.getAuthenticatedClient(email, (auth) =>
      google.people({ version: "v1", auth })
    );
  }

  /**
   * Retrieves contacts for the specified user account.
   */
  async getContacts(params: GetContactsParams): Promise<GetContactsResponse> {
    const { email, pageSize, pageToken, personFields } = params;

    if (!personFields) {
      throw new ContactsError(
        "Missing required parameter: personFields",
        "INVALID_PARAMS",
        'Specify the fields to retrieve (e.g. "names,emailAddresses")'
      );
    }

    try {
      // Ensure necessary scopes are granted
      await this.validateScopes(email, [CONTACTS_SCOPES.READONLY]);

      const peopleApi = await this.getPeopleClient(email);

      const response = await peopleApi.people.connections.list({
        resourceName: "people/me", // 'people/me' refers to the authenticated user
        pageSize: pageSize,
        pageToken: pageToken,
        personFields: personFields,
        // requestSyncToken: true // Consider adding for sync capabilities later
      });

      // We might want to add more robust mapping/validation here
      // For now we assume the response structure matches GetContactsResponse
      // Note: googleapis types might use 'null' where we defined optional fields ('undefined')
      // Need to handle potential nulls if strict null checks are enabled
      return response.data as GetContactsResponse;
    } catch (error) {
      // Handle known GoogleServiceError specifically
      if (error instanceof GoogleServiceError) {
        // Assuming GoogleServiceError inherits message and data from McpError
        // Use type assertion as the linter seems unsure
        const gError = error as McpError & {
          data?: { code?: string; details?: string };
        };
        throw new ContactsError(
          gError.message || "Error retrieving contacts", // Fallback message
          gError.data?.code || "GOOGLE_SERVICE_ERROR", // Code from data
          gError.data?.details // Details from data
        );
      }
      // Handle other potential errors (e.g. network errors)
      else if (error instanceof Error) {
        throw new ContactsError(
          `Failed to retrieve contacts: ${error.message}`,
          "UNKNOWN_API_ERROR" // More specific code
        );
      }
      // Handle non-Error throws
      else {
        throw new ContactsError(
          "Failed to retrieve contacts due to an unknown issue",
          "UNKNOWN_INTERNAL_ERROR" // More specific code
        );
      }
    }
  }

  // Add other methods like searchContacts, createContact, updateContact, deleteContact later
}

// Optional: Export a singleton instance if needed by the module structure
// let contactsServiceInstance: ContactsService | null = null;
// export function getContactsService(): ContactsService {
//   if (!contactsServiceInstance) {
//     contactsServiceInstance = new ContactsService();
//   }
//   return contactsServiceInstance;
// }
