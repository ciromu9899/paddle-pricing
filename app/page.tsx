import Link from 'next/link'

export default function WelcomePage() {
  return (
    <div className="welcome">
      <div className="check">✓</div>
      <h1>Welcome aboard!</h1>
      <p className="sub">
        Your subscription is set up and your 7-day free trial has started.
        A confirmation email is on its way.
      </p>
      <p>
        <Link href="/">← Back to pricing</Link>
      </p>
    </div>
  )
}
