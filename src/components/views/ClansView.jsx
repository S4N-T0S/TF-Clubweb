export const ClansView = ({ topClans }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-700">
            <th className="px-4 py-2 text-left text-gray-300">Rank</th>
            <th className="px-4 py-2 text-left text-gray-300">Club</th>
            <th className="px-4 py-2 text-left text-gray-300">Members in Top10k</th>
            <th className="px-4 py-2 text-left text-gray-300">Total Score</th>
          </tr>
        </thead>
        <tbody>
          {topClans.map((clan, index) => (
            <tr 
              key={clan.tag}
              className={`border-t border-gray-700 ${
                clan.tag === 'OG' 
                  ? 'bg-blue-900 bg-opacity-20' 
                  : 'hover:bg-gray-700'
              }`}
            >
              <td className="px-4 py-2 text-gray-300">#{index + 1}</td>
              <td className="px-4 py-2 text-gray-300">{clan.tag}</td>
              <td className="px-4 py-2 text-gray-300">{clan.memberCount}</td>
              <td className="px-4 py-2 text-gray-300">{clan.totalScore.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};