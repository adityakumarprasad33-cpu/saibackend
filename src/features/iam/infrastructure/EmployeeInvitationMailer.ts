import nodemailer, { Transporter } from 'nodemailer';

type InvitationMessage = {
  recipient: string;
  displayName: string;
  invitationUrl: string;
};

/** SMTP delivery for Firebase-generated password reset links. Never logs message bodies. */
export class EmployeeInvitationMailer {
  private static testSender: ((message: InvitationMessage) => Promise<void>) | null = null;

  public static isConfigured(): boolean {
    return Boolean(
      process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD &&
      (process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim()) &&
      this.invitationPageUrl() !== null &&
      Number.isInteger(Number(process.env.SMTP_PORT || 587)) &&
      Number(process.env.SMTP_PORT || 587) > 0 && Number(process.env.SMTP_PORT || 587) < 65536,
    );
  }

  public static isAvailable(): boolean {
    return this.isConfigured() || (process.env.NODE_ENV === 'testing' && this.testSender !== null);
  }

  public static buildInvitationUrl(token: string): string {
    const url = this.invitationPageUrl();
    if (!url) throw new Error('Invitation page origin is not configured.');
    return `${url.toString()}#${encodeURIComponent(token)}`;
  }

  private static invitationPageUrl(): URL | null {
    try {
      const url = new URL(process.env.EMPLOYEE_INVITATION_PAGE_URL || '');
      if (url.username || url.password || url.search || url.hash ||
          (process.env.NODE_ENV === 'production' ? url.protocol !== 'https:' : !['https:', 'http:'].includes(url.protocol))) return null;
      return url;
    } catch {
      return null;
    }
  }

  /** Test-only sender injection for emulator tests; production cannot install it. */
  public static setTestSender(sender: ((message: InvitationMessage) => Promise<void>) | null): void {
    if (process.env.NODE_ENV !== 'testing') throw new Error('Test sender is only available in testing.');
    this.testSender = sender;
  }

  public static async sendInvitation(message: InvitationMessage): Promise<void> {
    if (process.env.NODE_ENV === 'testing' && this.testSender) {
      await this.testSender(message);
      return;
    }
    if (!this.isConfigured()) throw new Error('Invitation delivery is not configured.');

    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Invitation delivery configuration is invalid.');
    }
    const transport: Transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    try {
      const safeName = message.displayName.replace(/[<>\r\n]/g, '').slice(0, 120);
      const escapedUrl = message.invitationUrl
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      await transport.sendMail({
        from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER,
        to: message.recipient,
        subject: 'Activate your SamadhanAI government account',
        text: `Hello ${safeName},\n\nUse this one-time invitation link to set your password and continue account activation:\n${message.invitationUrl}\n\nThis invitation expires in one hour. If it expires, ask your administrator to resend it. If you did not expect this invitation, ignore this email.`,
        html: `<p>Hello ${safeName},</p><p>Use this one-time invitation link to set your password and continue account activation:</p><p><a href="${escapedUrl}">Continue activation</a></p><p>This invitation expires in one hour. If it expires, ask your administrator to resend it. If you did not expect this invitation, ignore this email.</p>`,
      });
    } finally {
      transport.close();
    }
  }
}
