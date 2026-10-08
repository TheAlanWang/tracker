import { LEGAL_CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="October 8, 2026">
      <p>
        This policy explains what information Trackly ("we", "us") collects
        when you use gettrackly.dev and its related services (the web app, the
        API, and the Trackly MCP server), how we use it, and the choices you
        have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — your email address, display
          name, and password (stored hashed by our authentication provider). If
          you sign in with Google, we receive your name, email address, and
          profile picture from Google.
        </li>
        <li>
          <strong>Workspace content</strong> — the workspaces, projects, tasks,
          comments, checklists, sprints, goals, and other content you and your
          teammates create, plus an activity history of changes.
        </li>
        <li>
          <strong>AI assistant data</strong> — messages you send to the in-app
          AI assistant, its replies, and notes it saves to remember your
          preferences.
        </li>
        <li>
          <strong>Billing information</strong> — if you upgrade, payment is
          handled by Stripe. We receive your subscription status and billing
          email; we never see or store your full card number.
        </li>
        <li>
          <strong>Usage data</strong> — basic, cookie-free page-view analytics
          and performance metrics, and server logs (such as IP address and
          request times) used for security and debugging.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To provide, maintain, and secure the service.</li>
        <li>To send account and product emails, such as sign-up confirmation, password resets, invitations, and notifications you've enabled.</li>
        <li>To process payments and enforce plan limits.</li>
        <li>To understand aggregate usage and improve Trackly.</li>
      </ul>
      <p>
        We do not sell your personal information, and we do not use your
        workspace content to train AI models.
      </p>

      <h2>Google user data</h2>
      <p>
        If you choose "Continue with Google", Trackly requests only your basic
        profile (name, email address, and profile picture) to create and sign
        in to your account. We do not access your Gmail, Drive, Calendar, or any
        other Google data. Trackly's use of information received from Google
        APIs adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Service providers</h2>
      <p>We share information only with providers that help us run Trackly:</p>
      <ul>
        <li><strong>Supabase</strong> — database and authentication</li>
        <li><strong>Vercel</strong> — web hosting and analytics</li>
        <li><strong>Railway</strong> — API and MCP server hosting</li>
        <li><strong>Resend</strong> — transactional email</li>
        <li><strong>Stripe</strong> — payment processing</li>
        <li><strong>Anthropic</strong> — processes AI assistant messages to generate replies</li>
      </ul>
      <p>
        We may also disclose information if required by law or to protect the
        rights and safety of our users.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        We keep your information for as long as your account is active. You
        can edit or delete your content at any time inside the app. To delete
        your account and associated personal data, email us at{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> and
        we will process the request within 30 days. Content you created in a
        shared workspace may remain visible to that workspace's other members.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit (HTTPS) and access is restricted by
        authentication and row-level permissions. No method of transmission or
        storage is perfectly secure, but we work to protect your information.
      </p>

      <h2>Children</h2>
      <p>Trackly is not directed at children under 13, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. We'll revise the date
        above, and for material changes we'll notify you by email or in the app.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Email{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
