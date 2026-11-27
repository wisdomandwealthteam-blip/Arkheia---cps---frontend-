import VerificationGatePage from "../components/VerificationGatePage";

export default function ProvenanceCheckPage({ apiKey }) {
  return <VerificationGatePage gate="provenance" apiKey={apiKey} />;
}
