import { Link } from 'react-router-dom'
import LegalLayout, { Clause } from './LegalLayout'

/** Change this in one place if the support mailbox moves. */
export const SUPPORT_EMAIL = 'support@appointly.ph'

export default function Terms() {
  return (
    <LegalLayout
      title="Terms of Service"
      intro="These terms are the agreement between you and Appointly for the use of our booking platform. By creating an account, subscribing to a plan, or otherwise using Appointly, you accept them. If you are accepting on behalf of a business, you confirm that you are authorised to bind that business."
    >
      <Clause n={1} title="Who can use Appointly">
        <p>
          You must be at least 18 years old and able to enter into a binding contract. You are responsible for the
          accuracy of the business details you publish on your booking page, and for keeping your login credentials
          confidential. Activity under your account is treated as yours.
        </p>
      </Clause>

      <Clause n={2} title="Your account">
        <p>
          One account represents one business. You may invite staff members, and you remain responsible for what they do
          in your account. Tell us promptly at {SUPPORT_EMAIL} if you believe your account has been accessed without your
          permission.
        </p>
      </Clause>

      <Clause n={3} title="Free trial">
        <p>
          New businesses start on a 14-day free trial with no card required. When the trial ends, your dashboard stays
          locked until you subscribe to a plan. Your data is kept while your account exists, so subscribing later
          restores access to it.
        </p>
      </Clause>

      <Clause id="subscription" n={4} title="Subscriptions, billing and payment">
        <p>
          Plans are prepaid for the billing period shown at checkout — monthly or yearly — in the currency displayed on
          the plan. The features included in each plan are listed on our pricing page and may differ between plans.
        </p>
        <p>
          Payment is made by bank transfer or QR Ph from your own banking app. After paying, you submit the reference
          number and a photo of your receipt.{' '}
          <strong>Submitting a receipt does not activate your subscription on its own.</strong> Our team verifies the
          transfer first, usually within one business day, and your plan starts when the payment is approved. We may
          reject a payment where the amount, reference or receipt does not match the transfer we received, and we will
          tell you why.
        </p>
        <p>
          Subscriptions do not renew automatically and no card is stored. Access ends at the end of the period you paid
          for unless you submit another payment. We will notify you before a period ends so you have time to renew.
        </p>
        <p>
          We may change plan prices or features. Changes apply to periods you buy after the change — never to a period
          you have already paid for.
        </p>
      </Clause>

      <Clause id="refunds" n={5} title="Refunds and cancellation">
        <p>
          You may stop using Appointly at any time; because subscriptions do not renew automatically, stopping simply
          means not submitting another payment. Paid periods are non-refundable once your plan has been activated,
          except where a refund is required by law.
        </p>
        <p>
          If you pay twice for the same period, pay the wrong amount, or your payment is rejected after the money left
          your account, contact {SUPPORT_EMAIL} with your payment reference and we will refund or credit the difference.
        </p>
      </Clause>

      <Clause n={6} title="Acceptable use">
        <p>
          Do not use Appointly to break the law, to send unsolicited marketing, to upload malicious files, or to
          interfere with the service or other businesses using it. Do not attempt to access data belonging to another
          business. We may suspend an account that does any of these, and we will explain why where we can.
        </p>
      </Clause>

      <Clause n={7} title="Your data and your customers">
        <p>
          Your bookings, services, staff and customer records belong to you. We process them to run the service, as
          described in our{' '}
          <Link to="/privacy" className="font-medium text-brand-600 hover:text-brand-700">
            Privacy Policy
          </Link>
          . You are responsible for having a lawful basis to collect your customers&apos; details and for telling them
          how you use them.
        </p>
      </Clause>

      <Clause n={8} title="Availability">
        <p>
          We work to keep Appointly available, but we do not promise uninterrupted service. We may take the platform
          down for maintenance, and we may change or discontinue features. Where a change materially reduces what your
          paid plan includes, you may ask us for a pro-rated refund of the remainder of that period.
        </p>
      </Clause>

      <Clause n={9} title="Suspension and termination">
        <p>
          You can ask us to close your account at any time by writing to {SUPPORT_EMAIL}. We may suspend or close an
          account that breaches these terms or that we are required to close by law. When an account is closed we delete
          or anonymise its data as set out in the Privacy Policy.
        </p>
      </Clause>

      <Clause n={10} title="Liability">
        <p>
          Appointly is provided as-is. To the extent permitted by law, we are not liable for lost profits, lost
          bookings, or indirect or consequential loss, and our total liability for any claim is limited to the amount
          you paid us in the 12 months before the claim arose. Nothing here limits liability that cannot be limited by
          law.
        </p>
      </Clause>

      <Clause n={11} title="Changes to these terms">
        <p>
          We may update these terms. If a change is significant we will notify you in the dashboard or by email before
          it takes effect. Continuing to use Appointly after that means you accept the updated terms.
        </p>
      </Clause>

      <Clause n={12} title="Governing law and contact">
        <p>
          These terms are governed by the laws of the Republic of the Philippines, and disputes are subject to the
          courts of the Philippines. Questions about these terms go to {SUPPORT_EMAIL}.
        </p>
      </Clause>
    </LegalLayout>
  )
}
