import VerificationGatePage from "../components/VerificationGatePage";

export default function CustodyCheckPage({ apiKey }) {
  return <VerificationGatePage gate="custody" apiKey={apiKey} />;
}
