import VerificationGatePage from "../components/VerificationGatePage";

export default function EdgeVerifyPage({ apiKey }) {
  return <VerificationGatePage gate="edge" apiKey={apiKey} />;
}
