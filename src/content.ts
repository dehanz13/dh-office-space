// Everything about you that the office shows. Each line marked PLACEHOLDER
// still needs your real details: PLACEHOLDERS.md lists them all, with where
// each one shows in the room. Find them with: grep -rn PLACEHOLDER src layout

export const owner = {
  name: 'Danniel',
  // PLACEHOLDER: confirm the one-line role under your name on the pin board.
  role: 'Builder of software and agent systems',
  location: 'Dallas, Texas',
  // PLACEHOLDER: the handle the desk screens show (git push, the pull request).
  github: 'danniel',
  // PLACEHOLDER: your roles, newest first (the pin board fits three).
  experience: [
    { title: 'Your current role', where: 'Company', when: '20XX – now' },
    { title: 'Previous role', where: 'Company', when: '20XX – 20XX' },
    { title: 'Earlier role', where: 'Company', when: '20XX – 20XX' },
  ],
  // PLACEHOLDER: confirm or edit (about eight fit).
  skills: ['TypeScript', 'React', 'Next.js', 'three.js', 'GSAP', 'Blender', 'AI agents', 'System design'],
  // PLACEHOLDER: degree or programme, then school and year.
  education: ['Degree or programme', 'School · year'],
  // PLACEHOLDER: one or two short lines.
  nowBuilding: ['This office, one object at a time.', 'Ask me about the agent lab →'],
  // PLACEHOLDER: three photos for the pin board. Put the files in
  // public/photos/board/ and set src to e.g. '/photos/board/1.jpg'. A card
  // with an empty src shows "your photo" and requests nothing.
  photos: [
    { src: '', caption: 'me' },
    { src: '', caption: 'the team' },
    { src: '', caption: 'on the road' },
  ],
}

/**
 * PLACEHOLDER: the poster in the elevator. Each ride shows one at random. Until
 * you have your own, these are well-known lines about building software.
 */
export const elevatorPosters: { quote: string; by: string; source?: string }[] = [
  { quote: 'Make it work, make it right, make it fast.', by: 'Kent Beck' },
  { quote: 'Simplicity is prerequisite for reliability.', by: 'Edsger W. Dijkstra', source: 'EWD498, 1975' },
  { quote: 'Talk is cheap. Show me the code.', by: 'Linus Torvalds', source: 'linux-kernel, 2000' },
  { quote: 'Premature optimization is the root of all evil.', by: 'Donald Knuth', source: '1974' },
  { quote: 'There are only two hard things in Computer Science: cache invalidation and naming things.', by: 'Phil Karlton' },
  { quote: 'Programs must be written for people to read, and only incidentally for machines to execute.', by: 'Abelson & Sussman', source: 'SICP, 1985' },
  { quote: 'Adding manpower to a late software project makes it later.', by: 'Fred Brooks', source: 'The Mythical Man-Month, 1975' },
  { quote: 'The best way to predict the future is to invent it.', by: 'Alan Kay', source: '1971' },
]

/**
 * The playlist in the music corner: Spotify's public "San Holo Radio".
 * To change it, copy a playlist link in Spotify (Share → Copy link to playlist)
 * and paste its ID here as spotify:playlist:<id>.
 */
export const music = {
  spotifyPlaylistUri: 'spotify:playlist:37i9dQZF1E4lIqBvCSmcIO',
  playlistName: 'San Holo Radio',
}

/** What the inspect panel says about each hotspot. */
export const hotspotText: Record<string, string> = {
  desk: 'The main desk, white on dark grey legs: a 34" monitor running an edit-test-commit loop, a vertical monitor with the dev server and CI, the laptop on a pull request, and a light bar over the keyboard. Its keypad, under the front edge, raises it on its own.',
  'agent-lab': 'The lab desk: two Mac minis under the monitors run the agent factory. Herdr on the left keeps an agent in each pane (scout, plan, build, test, review); on the right, the builder\'s Pi session up close. A notebook, a pen and an iPad Pro on the side. It rises on its own keypad.',
  rig: 'The rig: a glass tower with a flagship graphics card, an E-ATX board whose display cycles the CPU temperature, a 360 mm liquid cooler with a temperature screen on the pump, four lit memory sticks, a 1600 W supply in the basement and ten lit fans.',
  blinds: 'Hold ▲ or ▼ (or ↑ ↓) to move the blind over these three panes. Let go to stop it anywhere.',
  'blinds-all': 'The panel by the door moves every blind at once: hold ▲ or ▼ (or ↑ ↓). Each group below has its own buttons too.',
  dyson: 'An air purifier, on and sweeping side to side. The display reads the air: PM2.5 is good today.',
  whiteboard: 'Mechanics, Maxwell, a little quantum and a few favourite identities, with one question in red.',
  fuel: 'Fully stocked. Strictly for emergencies (every afternoon).',
  'glass-board': 'A distributed-systems brainstorm in marker, next to how this office is built.',
  'view-west': 'Dallas, from twenty-three floors up.',
  // PLACEHOLDER: the console corner waits for your own games.
  game: 'The console corner: Dallas against London on the big screen, the second half under way. My own games are on the way.',
  music: 'The listening corner: two turntables and a battle mixer on a fluted record console, between studio monitors whose woofers light with the bass. Press play and keep walking: the player docks in the corner, and M plays or pauses from anywhere.',
  neon: 'Lights up when the office lights go down.',
  library: 'A library wall: a marble Zeus between a gold and a jade dragon in lit arches, a penny-farthing, an armillary sphere, a ship in a bottle, an hourglass, a rangefinder camera, Newton\'s cradle, a Rubik\'s cube, and a ladder on a brass rail.',
  clocks: 'Dallas, London and Jakarta, always on the right time.',
  pinboard: 'Experience, skills and photos.',
  'art-e1': 'Thomas Cole, The Voyage of Life: Youth (1842). A young man sets out on the river of life toward a castle in the sky, the mountains still ahead. National Gallery of Art, Washington (CC0).',
  'art-s2': 'Hilma af Klint, The Ten Largest, No. 7, Adulthood (1907). Public domain.',
  'art-e2': 'Odilon Redon, The Buddha (1906–07), pastel. Musée d\'Orsay. Public domain.',
  'art-jobs': 'Steve Jobs, January 1984, the week the Macintosh shipped. Photograph by Bernard Gotfryd (public domain, Library of Congress), printed in black and white.',
  // PLACEHOLDER: the three coming-soon spots (their sticky notes are in layout/office.json).
  'soon-wall-e': 'Spot #1, saved for something new.',
  'soon-floor-c': 'Spot #2, saved for something new.',
  'soon-floor-w': 'Spot #3, saved for something new.',
}
