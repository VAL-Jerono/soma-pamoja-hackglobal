/** The picture area. Always filled with the lesson picture on a themed scene, never an empty box. */
export function Scene({ picture, small = false }: { picture: string; small?: boolean }) {
  return (
    <div className={small ? 'scene small' : 'scene'} aria-hidden="true">
      <span className="cloud" /><span className="hill2" />
      <div className="picture">{picture}</div>
    </div>
  )
}
