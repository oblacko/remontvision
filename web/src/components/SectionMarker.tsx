export function SectionMarker({ index, children }: { index: string; children: string }) {
  return <p className="eyebrow">[ {index} ] <span className="ml-3">{children}</span></p>
}
