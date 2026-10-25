export const NO_VOTES_COLOR = "#cccccc";

export function hasCountedVotes(electorate, voteType = "electorate") {
  const party = voteType === "party";
  const total = electorate?.[party ? "total_valid_party_votes" : "total_valid_candidate_votes"];
  if (total != null) return Number(total) > 0;
  const rows = electorate?.[party ? "party_vote_results" : "candidate_results"] ?? [];
  return rows.some((row) => Number(row.votes) > 0);
}
