import { Link } from 'react-router-dom'
import LegalLayout, { Clause } from './LegalLayout'
import { SUPPORT_EMAIL } from './Terms'

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="This policy explains what Appointly collects, why we collect it, and what you can ask us to do with it. It covers business owners and staff who use the dashboard, and the customers who book through an Appointly booking page."
    >
      <Clause n={1} title="What we collect">
        <p>
          <strong>Account details</strong> — your name, email address and password (stored only as a hash), plus the
          business profile, services, staff and opening hours you enter.
        </p>
        <p>
          <strong>Booking details</strong> — the name, contact details and appointment notes your customers submit when
          they book with you.
        </p>
        <p>
          <strong>Payment details</strong> — the plan you chose, the amount, your transfer reference number, the payment
          date and the receipt image you upload. We never see or store your card or bank login details; payment happens
          inside your own banking app.
        </p>
        <p>
          <strong>Technical details</strong> — basic logs needed to keep the service running and secure, such as request
          times and errors.
        </p>
      </Clause>

      <Clause n={2} title="Why we use it">
        <p>
          To run your booking page and dashboard, to send booking and billing notifications, to verify subscription
          payments, to provide support, to detect abuse, and to meet our legal and tax obligations.
        </p>
        <p>We do not sell your data, and we do not use your customers&apos; details for our own marketing.</p>
      </Clause>

      <Clause n={3} title="Who can see it">
        <p>
          Each business only sees its own data; this is enforced in our database, not just in the interface. Appointly
          administrators can see subscription payments and the receipts submitted with them, so that payments can be
          verified.
        </p>
        <p>
          We use service providers to host the platform and its database and file storage, and to send email. They
          process data on our instructions only.
        </p>
      </Clause>

      <Clause n={4} title="How long we keep it">
        <p>
          Account and booking data is kept while your account exists. Payment records and receipts are kept for as long
          as tax and accounting rules require. When you close your account we delete or anonymise your data within 30
          days, apart from records we are required to keep.
        </p>
      </Clause>

      <Clause n={5} title="Your rights">
        <p>
          Under the Data Privacy Act of 2012 you may ask for a copy of your data, correct it, ask us to delete it, or
          object to how we use it. Write to {SUPPORT_EMAIL} and we will respond within 30 days. If you are a customer
          who booked through an Appointly page, contact that business first — they control the booking record, and we
          act on their instructions.
        </p>
      </Clause>

      <Clause n={6} title="Security">
        <p>
          Data is encrypted in transit, access is restricted per business at the database level, and receipt images are
          stored in private buckets. No system is perfectly secure; if a breach affects your data we will notify you and
          the National Privacy Commission as the law requires.
        </p>
      </Clause>

      <Clause n={7} title="Cookies">
        <p>
          We store a session token in your browser so you stay signed in. We do not use advertising or third-party
          tracking cookies.
        </p>
      </Clause>

      <Clause n={8} title="Changes and contact">
        <p>
          We will post any update here and notify you if the change is significant. Questions about this policy, or
          about our{' '}
          <Link to="/terms" className="font-medium text-brand-600 hover:text-brand-700">
            Terms of Service
          </Link>
          , go to {SUPPORT_EMAIL}.
        </p>
      </Clause>
    </LegalLayout>
  )
}
