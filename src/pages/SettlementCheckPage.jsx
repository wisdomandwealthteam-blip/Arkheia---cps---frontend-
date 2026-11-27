import VerificationGatePage from "../components/VerificationGatePage";

export default function SettlementCheckPage({ apiKey }) {
  return <VerificationGatePage gate="settlement" apiKey={apiKey} />;
}
