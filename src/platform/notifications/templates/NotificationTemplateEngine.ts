/**
 * Notification Template Engine & Variable Substitution
 */

export interface RenderedTemplate {
  title: string;
  body: string;
}

export class NotificationTemplateEngine {
  private static templates: Record<string, { title: string; body: string }> = {
    GRIEVANCE_SUBMITTED_V1: {
      title: 'Grievance Received: {{publicId}}',
      body: 'Your grievance regarding {{category}} has been registered successfully on SamadhanAI.',
    },
    CASE_ASSIGNED_V1: {
      title: 'Nodal Officer Assigned: {{publicId}}',
      body: 'Your case has been assigned to Officer {{officerName}} at {{departmentName}}.',
    },
    STATUS_CHANGED_V1: {
      title: 'Grievance Status Updated: {{publicId}}',
      body: 'The status of your grievance {{publicId}} has changed to {{newStatus}}.',
    },
    SECURITY_ALERT_V1: {
      title: 'Security Alert: Password Changed',
      body: 'Your SamadhanAI account password was modified recently.',
    },
  };

  public static render(templateId: string, variables: Record<string, string>): RenderedTemplate {
    const template = this.templates[templateId] || {
      title: 'SamadhanAI System Notification',
      body: 'You have a new update regarding your account or grievance.',
    };

    let title = template.title;
    let body = template.body;

    Object.entries(variables).forEach(([key, val]) => {
      const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      title = title.replace(placeholder, val);
      body = body.replace(placeholder, val);
    });

    return { title, body };
  }
}
