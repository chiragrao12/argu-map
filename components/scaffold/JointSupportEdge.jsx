'use client';

// Renders joint (syllogistic) support: each premise's line curves into a shared
// junction, and a single thicker "trunk" continues from the junction to the claim.
export default function JointSupportEdge({ sourceX, sourceY, data, markerEnd }) {
  const junction = data?.junction;
  const targetPoint = data?.targetPoint;
  if (!junction) return null;
  const midY = (sourceY + junction.y) / 2;
  const branch = `M ${sourceX},${sourceY} C ${sourceX},${midY} ${junction.x},${midY} ${junction.x},${junction.y}`;
  return (
    <>
      <path d={branch} fill="none" stroke="#10b981" strokeWidth={2.5} className="react-flow__edge-path" />
      {data.isTrunk && targetPoint && (
        <>
          <path
            d={`M ${junction.x},${junction.y} L ${targetPoint.x},${targetPoint.y}`}
            fill="none"
            stroke="#10b981"
            strokeWidth={4}
            markerEnd={markerEnd}
            className="react-flow__edge-path"
          />
          <circle cx={junction.x} cy={junction.y} r={4} fill="#10b981" />
        </>
      )}
    </>
  );
}
