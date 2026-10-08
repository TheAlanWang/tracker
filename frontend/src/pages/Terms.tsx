import { Link } from "react-router-dom";

import { LEGAL_CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="October 8, 2026">
      <p>
        These terms govern your use of Trackly, including gettrackly.dev, the
        API, and the Trackly MCP server (the "Service"). By creating an account
        or using the Service, you agree to them.
      </p>

      <h2>Your account</h2>
      <p>
        You must provide accurate information and keep your login credentials
        secure. You are responsible for activity under your account. You must
        be at least 13 years old to use Trackly.
      </p>

      <h2>Your content</h2>
      <p>
        You own the content you put into Trackly. You grant us a limited
        license to host, store, and display it only as needed to operate the
        Service for you and your workspace members. How we handle personal
        information is described in our <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for anything illegal, or to store or share content that infringes others' rights.</li>
        <li>Attempt to access other users' data or bypass security or plan limits.</li>
        <li>Disrupt the Service, including through excessive automated requests.</li>
        <li>Resell or redistribute the Service without permission.</li>
      </ul>

      <h2>Plans and billing</h2>
      <p>
        Trackly offers a free plan and paid plans. Paid subscriptions are
        billed in advance through Stripe and renew automatically until
        cancelled. You can cancel at any time; your plan stays active until the
        end of the current billing period. Fees are non-refundable except where
        required by law. We may change prices with advance notice.
      </p>

      <h2>AI features</h2>
      <p>
        The AI assistant can make mistakes. Review its output before relying on
        it, especially before it changes your tasks or data.
      </p>

      <h2>Termination</h2>
      <p>
        You can stop using Trackly and request account deletion at any time.
        We may suspend or terminate accounts that violate these terms.
      </p>

      <h2>Disclaimers and liability</h2>
      <p>
        The Service is provided "as is" without warranties of any kind. To the
        maximum extent permitted by law, Trackly is not liable for indirect,
        incidental, or consequential damages, or for loss of data or profits,
        and our total liability is limited to the amount you paid us in the 12
        months before the claim.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. We'll revise the date above, and continued
        use after changes take effect means you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
