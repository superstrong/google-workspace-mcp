import { google } from 'googleapis';

interface CalendarEventParams {
  query?: string;
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
}

interface CreateEventParams {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
  }>;
  recurrence?: string[];
}

interface ManageEventParams {
  eventId: string;
  action: 'accept' | 'decline' | 'tentative' | 'propose_new_time' | 'update_time';
  comment?: string;
  newTimes?: Array<{
    start: {
      dateTime: string;
      timeZone?: string;
    };
    end: {
      dateTime: string;
      timeZone?: string;
    };
  }>;
}

export class CalendarService {
  private calendar: any;
  private oauth2Client: any;

  constructor(accessToken: string) {
    this.oauth2Client = new google.auth.OAuth2();
    this.oauth2Client.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * List calendar events with filtering
   */
  async listEvents(params: CalendarEventParams): Promise<any> {
    try {
      const { query, maxResults = 10, timeMin, timeMax } = params;

      const listParams: any = {
        calendarId: 'primary',
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      };

      if (timeMin) {
        listParams.timeMin = timeMin;
      } else {
        // Default to current time if no timeMin specified
        listParams.timeMin = new Date().toISOString();
      }

      if (timeMax) {
        listParams.timeMax = timeMax;
      }

      if (query) {
        listParams.q = query;
      }

      const response = await this.calendar.events.list(listParams);

      return {
        events: response.data.items || [],
        nextPageToken: response.data.nextPageToken,
        summary: response.data.summary
      };

    } catch (error) {
      throw new Error(`Failed to list calendar events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a specific calendar event
   */
  async getEvent(eventId: string): Promise<any> {
    try {
      const response = await this.calendar.events.get({
        calendarId: 'primary',
        eventId: eventId
      });

      return response.data;

    } catch (error) {
      throw new Error(`Failed to get calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new calendar event
   */
  async createEvent(params: CreateEventParams): Promise<any> {
    try {
      const { summary, description, start, end, attendees, recurrence } = params;

      const eventData: any = {
        summary,
        description,
        start,
        end
      };

      if (attendees && attendees.length > 0) {
        eventData.attendees = attendees;
      }

      if (recurrence && recurrence.length > 0) {
        eventData.recurrence = recurrence;
      }

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventData,
        sendUpdates: 'all' // Send invitations to attendees
      });

      return response.data;

    } catch (error) {
      throw new Error(`Failed to create calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Manage calendar event responses and updates
   */
  async manageEvent(params: ManageEventParams): Promise<any> {
    try {
      const { eventId, action, comment, newTimes } = params;

      switch (action) {
        case 'accept':
        case 'decline':
        case 'tentative':
          return await this.respondToEvent(eventId, action, comment);

        case 'propose_new_time':
          if (!newTimes || newTimes.length === 0) {
            throw new Error('New times are required for propose_new_time action');
          }
          return await this.proposeNewTime(eventId, newTimes[0], comment);

        case 'update_time':
          if (!newTimes || newTimes.length === 0) {
            throw new Error('New times are required for update_time action');
          }
          return await this.updateEventTime(eventId, newTimes[0]);

        default:
          throw new Error(`Invalid action: ${action}`);
      }

    } catch (error) {
      throw new Error(`Failed to manage calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId: string, sendUpdates: string = 'all'): Promise<any> {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendUpdates: sendUpdates
      });

      return {
        success: true,
        message: 'Event deleted successfully',
        eventId
      };

    } catch (error) {
      throw new Error(`Failed to delete calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods

  private async respondToEvent(eventId: string, response: string, comment?: string): Promise<any> {
    // Get the current event
    const event = await this.calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    });

    // Find the current user's attendee entry
    const userEmail = await this.getCurrentUserEmail();
    const attendees = event.data.attendees || [];
    
    const updatedAttendees = attendees.map((attendee: any) => {
      if (attendee.email === userEmail) {
        return {
          ...attendee,
          responseStatus: response === 'accept' ? 'accepted' : 
                         response === 'decline' ? 'declined' : 'tentative',
          comment: comment
        };
      }
      return attendee;
    });

    // Update the event with the response
    const updateResponse = await this.calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: {
        ...event.data,
        attendees: updatedAttendees
      },
      sendUpdates: 'all'
    });

    return {
      success: true,
      response: response,
      comment: comment,
      event: updateResponse.data
    };
  }

  private async proposeNewTime(eventId: string, newTime: any, comment?: string): Promise<any> {
    // For now, we'll add a comment to the event with the proposed time
    // In a full implementation, this would use the Calendar API's proposal features
    
    const event = await this.calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    });

    const proposalComment = `Proposed new time: ${newTime.start.dateTime} - ${newTime.end.dateTime}${comment ? '. ' + comment : ''}`;

    const updateResponse = await this.calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: {
        ...event.data,
        description: (event.data.description || '') + '\n\n' + proposalComment
      },
      sendUpdates: 'all'
    });

    return {
      success: true,
      action: 'propose_new_time',
      proposedTime: newTime,
      comment: comment,
      event: updateResponse.data
    };
  }

  private async updateEventTime(eventId: string, newTime: any): Promise<any> {
    const event = await this.calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    });

    const updateResponse = await this.calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: {
        ...event.data,
        start: newTime.start,
        end: newTime.end
      },
      sendUpdates: 'all'
    });

    return {
      success: true,
      action: 'update_time',
      newTime: newTime,
      event: updateResponse.data
    };
  }

  private async getCurrentUserEmail(): Promise<string> {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const response = await oauth2.userinfo.get();
      return response.data.email || '';
    } catch (error) {
      throw new Error('Failed to get current user email');
    }
  }
}
