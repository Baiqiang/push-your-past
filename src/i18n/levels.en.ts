// 内置关卡的英文名称与提示（中文写在 src/levels/levels.ts 里）
export const LEVEL_TEXT_EN: Record<string, { name: string; hint: string; hints?: string[] }> = {
  '1-1': {
    name: "On Duty",
    hint: "The pink door opens only while something is on the pink plate. Press E to imprint: from this moment, every step you take is kept. Press E again to rewind: time returns to when the imprint began, and your past will comply. Exactly. Esc discards the imprint, Z undoes, R restarts.",
    hints: [
      "The pink plate must stay occupied. Once you leave, it is empty.",
      "Imprint while standing on the pink plate.",
      "Enter any single step after imprinting, Space to wait will do, then rewind. Your past will remain on the pink plate.",
    ],
  },
  '1-2': {
    name: "Two Posts",
    hint: "Shadows are not limited to one. They act in the order they were made. You always act last.",
    hints: [
      "Two doors, two plates. One shadow holds one plate.",
      "Imprints are capped at 4 steps. Starting from the entrance is not enough. Imprint nearby.",
      "Imprint directly above the pink plate, step down, rewind. Repeat above the blue plate.",
    ],
  },
  '1-3': {
    name: "Delegated",
    hint: "Push the box onto \u25c7. You cannot push a box and hold a plate at the same time. Arrange for help.",
    hints: [
      "The pink door is on the box's route. The pink plate is in the upper corridor.",
      "Imprint at the start and walk around onto the pink plate.",
      "While it holds the pink plate, come down and keep pushing the box right.",
    ],
  },
  '1-4': {
    name: "As Before",
    hint: "Shadows keep inputs, not positions. If you walked into a closed door while imprinting, it will walk into it again. If the door is open by then, it goes through. Arrow tiles can only be entered in the arrow's direction.",
    hints: [
      "The blue plate is above, behind the pink door. Once the door opens, the upward steps take effect.",
      "Imprint directly below the pink door. Wait a few steps, then keep moving up. Hitting the door while imprinting is fine.",
      "After rewinding, step on the pink plate. The pink door opens just as it walks up to the blue plate, and the blue door opens with it.",
    ],
  },
  '2-1': {
    name: "Doorstop",
    hint: "Shadows are solid and can be pushed. A door cannot close with something inside it.",
    hints: [
      "Leave the pink plate and the pink door closes. Unless something is in it.",
      "Imprint at the start, take two steps right into the door, rewind.",
      "Step on the pink plate to open the door. Once it is inside, push it right from behind. It will pass over the blue plate on the way.",
    ],
  },
  '2-2': {
    name: "Extension",
    hint: "A pushed shadow does not revise its plan. It carries on with its remaining steps from wherever it lands.",
    hints: [
      "Imprints cap at 4 steps. From the pink plate to the box is one short.",
      "Stand on the pink plate and imprint 4 steps right. After rewinding, push it once from behind as it clears the door.",
      "Turn back right after. It handles the box. You return to the exit while the door is still open.",
    ],
  },
  '2-3': {
    name: "Rerouted",
    hint: "A step that hit a wall while imprinting may not hit one on a different route.",
    hints: [
      "The blue plate is in the upper lane, up and to the right of the pink door.",
      "Imprint on the pink plate: down, right, wait, up. That last step hits a wall for now.",
      "After rewinding, follow and push it one tile. Its upward step will land on the blue plate.",
    ],
  },
  '3-1': {
    name: "Escort",
    hint: "Shadows act before you. Stand in front of one and it will push you. Being pushed does not cost you a step.",
    hints: [
      "Leave the pink plate and the door closes. Unless you are pushed inside before it does.",
      "Imprint at the start: step onto the pink plate once, then three steps right.",
      "After rewinding, wait in place. The moment it steps back onto the pink plate the door opens, and it pushes you in.",
    ],
  },
  '3-2': {
    name: "Boost",
    hint: "Get pushed one tile, then walk one more. Two tiles in a single step.",
    hints: [
      "The pink door is open only while someone is on the pink plate. On foot alone, it shuts first.",
      "Imprint: go up onto the blue plate, then come back and keep going right.",
      "After rewinding, stand in its path. As it pushes you onto the pink plate, step forward yourself and you are through.",
    ],
  },
  '3-3': {
    name: "Hitch",
    hint: "Imprints need not start at the entrance. Rewinding returns you to wherever you pressed E.",
    hints: [
      "Like the last one, but capped at 6 steps. Not enough from the entrance.",
      "Walk three steps right, to the right of the blue plate, then imprint.",
      "Imprint: up onto the blue plate, back down, then right all the way. After rewinding, stand in front of it and move forward as it pushes you onto the pink plate.",
    ],
  },
  '4-1': {
    name: "Crowding",
    hint: "Shadows push each other too. The earlier one moves first and can shove the later one elsewhere.",
    hints: [
      "The blue plate sits in the notch above. One shadow cannot reach it in 3 steps.",
      "Make both shadows at the start. The first goes right, the second goes right then up.",
      "The first pushes the second from behind, giving it one extra tile, enough to turn onto the blue plate. You go to the pink plate.",
    ],
  },
  '4-2': {
    name: "Proxy",
    hint: "Later shadows can push earlier ones. The push you cannot reach, delegate to another past.",
    hints: [
      "The pink plate is on the far side of the blue door. You cannot get there.",
      "First make a shadow that walks left into the blue door. Stand on the blue plate to open it, so the shadow jams inside.",
      "Back at the start, make a second one that keeps going left. It will shove the first onto the pink plate, and you leave to the right.",
    ],
  },
  '4-3': {
    name: "Relay",
    hint: "You push the second, the second pushes the first. Imprints cap at 3 steps. No solo solution exists.",
    hints: [
      "Like the last one, but even going left the whole way, the second cannot reach the one in the door.",
      "The first still starts from the blue plate and jams into the blue door. Make the second one tile left of the blue plate.",
      "After rewinding, push the second left once. It will push the first toward the pink plate.",
    ],
  },
  '5-1': {
    name: "Excuse Me",
    hint: "The grey one is an echo: a past that came with the level. You cannot edit it, only block it or push it. Stand where it is about to step and that step fails.",
    hints: [
      "The echo steps onto the pink plate, stays a while, then leaves. The pink door is open only during that window.",
      "It leaves the pink plate by stepping right. You can reach that tile.",
      "Get to the right of the pink plate before it moves, let that step fail, then head for the door.",
    ],
  },
  '5-2': {
    name: "Box on Duty",
    hint: "Boxes block echoes too. You have somewhere to be. Leave the blocking to the box.",
    hints: [
      "The door is at the end of the corridor. You cannot afford to wait by the pink plate.",
      "The box is directly below the tile to the right of the pink plate.",
      "Push the box up into the tile right of the pink plate, then turn and run right.",
    ],
  },
  '5-3': {
    name: "Both Ends",
    hint: "When the left echo leaves, the door closes. The right echo will soon block the exit. There is one of you. Make another.",
    hints: [
      "You need to keep moving right. Have someone else watch the left.",
      "Imprint at the start, two steps up, to the right of the pink plate.",
      "After rewinding, do not look back. Keep going right and reach the exit before the right echo comes down.",
    ],
  },
  '6-1': {
    name: "Midway",
    hint: "You can imprint while an echo is mid-route. Rewinding returns to that moment. The echo resumes from where it was, not from the start.",
    hints: [
      "The echo walks to the far left, then turns back. Someone must intercept it on the way back.",
      "Follow it left and imprint once it has passed the pink plate.",
      "Imprint a single wait, then rewind. The shadow holds the door open from the pink plate. Follow, and block the returning echo at the doorway.",
    ],
  },
  '6-2': {
    name: "Window",
    hint: "The pink door is open while the echo stands on the pink plate. It will not stand there forever.",
    hints: [
      "The pink door opens only briefly. Behind it is the blue plate. The blue door is below.",
      "Slip in while it is open and imprint on the tile behind the door.",
      "Imprint: bump right once, then up. After rewinding, push it from behind and it lands on the blue plate. Get out before the door shuts, then go down.",
    ],
  },
  '7-1': {
    name: "Deviation",
    hint: "You push the first shadow off course. The second pushes it somewhere it has never been. Same inputs. Different outcome.",
    hints: [
      "The pink plate is at the far right. One shadow cannot reach it in 3 steps.",
      "Make the first shadow at the start. Walking up into the wall is fine. Its job is to be pushed.",
      "After rewinding, push it right two tiles. Make the second behind it, walking right, to push further. You head back to the door.",
    ],
  },
  '7-2': {
    name: "Dominoes",
    hint: "The first pushes the second. You push the first. Change the earliest past and everything after it follows.",
    hints: [
      "The pink plate is in the notch at bottom left. The blue door needs the blue plate held down.",
      "Stand on the blue plate and make two in a row: the first up, left, left; the second left, left, down.",
      "After rewinding, step left. You push the first into the second, and the second is squeezed above the pink plate.",
    ],
  },
  '7-3': {
    name: "Step by Step",
    hint: "Check each step: who pushed whom, who was blocked, where everyone ended up.",
    hints: [
      "The blue plate is in the notch behind the pink door. Something must jam the pink door before you can get in to make the second.",
      "The first shadow walks three steps right. After rewinding, push it so it stops inside the pink door.",
      "Make the second inside the door: right, down, right. It squeezes the first out and turns into the blue plate.",
    ],
  },
  '7-4': {
    name: "Exact Count",
    hint: "Every step of every shadow has to be accounted for. If you stall, check the panel on the right. The red step is the problem.",
    hints: [
      "The pink plate is behind the blue door. The blue plate is just to your right.",
      "The first shadow walks left into the blue door. After rewinding, step on the blue plate once, then follow and push it.",
      "Stand inside the blue door and make the second: left, left, up. It pushes the first forward and turns onto the pink plate.",
    ],
  },
  '8-1': {
    name: "Admitted",
    hint: "The purple dashed frame is a past-only gate: shadows pass, you and boxes do not. Walking into it while imprinting is fine. On replay, your past walks straight through.",
    hints: [
      "The pink plate is behind the purple gate. You cannot get through. Your past can.",
      "Imprint directly below the purple gate and press up twice. Both will hit the gate.",
      "After rewinding, go right. It passes the purple gate and steps onto the pink plate, and the pink door opens.",
    ],
  },
  '8-2': {
    name: "ID Check",
    hint: "The solid cyan frame is a present-only gate: only you may pass. Shadows, echoes and boxes may not.",
    hints: [
      "The echo is heading for the exit. The cyan gate stops it. It does not stop you.",
      "The pink door needs the pink plate held down. Imprint one tile left of it. One step is enough.",
      "After rewinding, go up through the pink door and through the cyan gate. The echo stays on the other side.",
    ],
  },
  '8-3': {
    name: "Split Routes",
    hint: "The purple gate lets only shadows through. The cyan gate lets only you through. Each takes its own door.",
    hints: [
      "The box is right of the purple gate. Pushing it from the gate side is something only a shadow can do.",
      "The first shadow holds the pink plate so you can enter the pink door. Make the second inside that door and send it through the purple gate to push the box one tile right.",
      "Then push the box onto the pink plate, go up around through the cyan gate, and push it down onto \u25c7 from above.",
    ],
  },
  '9-1': {
    name: "Collapse",
    hint: "The ground with cracks in it is cracked floor. Once everything on it has left, it collapses into a pit. You and boxes cannot enter a pit. A shadow or echo that falls in is erased, and its remaining moves are void. Rewinding restores the floor.",
    hints: [
      "Left alone, the echo ends up on the exit and stays there.",
      "The echo collapses the crack itself. The pit is just left of where it started.",
      "Go around below to the right of the echo's starting tile. When it steps back there, push it left into the pit.",
    ],
  },
  '9-2': {
    name: "Return Trip",
    hint: "A crack collapses when its last occupant leaves. That can be you.",
    hints: [
      "Left alone, the echo stops at the junction leading to the exit.",
      "Cross the right-hand crack first. Once it collapses, the echo cannot push you. Meet it in the corridor and push it back to the left.",
      "Once it is left of the first crack, step onto the crack and off again. Its next step drops it into the pit.",
    ],
  },
  '9-3': {
    name: "One Step Ahead",
    hint: "Blocking one of an echo's steps changes its route. The new route can lead over a pit.",
    hints: [
      "Left alone, the echo ends in the upper passage, blocking the way to the exit. It collapses the middle crack itself.",
      "Stand in the top right corner before it steps up. It stays right of the pit, and its next step left drops it in. You cannot get there in time alone.",
      "Imprint at the left end of the upper passage: wait one step, then right. After rewinding, press right twice. On the second press your shadow pushes you one tile further.",
    ],
  },
  '9-4': {
    name: "Use and Toss",
    hint: "Only one shadow can be on the field at a time here. But a shadow that falls into a pit is gone, and its slot frees up, so you can leave another.",
    hints: [
      "The pink door and the blue door each need a shadow holding a plate, and you can only have one at a time.",
      "Once the first shadow has held the pink plate, you need to get rid of it. The cracked floor turns into a pit after it collapses. Let it walk back and fall in.",
      "Imprint right away: wait, right, wait, down onto the pink plate, up, right. After the rewind keep walking right. It gives you a push, the crack collapses, it holds the plate while you pass, then walks back into the pit. Above the blue plate, leave another shadow that steps down.",
    ],
  },
  '10-1': {
    name: "Shortcut",
    hint: "The two orange rings are a pair of portals. Step into one and you land on the other. Anything pushed into one does the same.",
    hints: [
      "The pink plate is on the other side of the wall. The only way there is through the portal.",
      "Imprint at the start and walk right through the portal.",
      "Get it onto the pink plate. After rewinding, go through the portal yourself and down through the pink door to the exit.",
    ],
  },
  '10-2': {
    name: "Rerouted",
    hint: "A shadow pushed into a portal carries out its remaining moves on the other side.",
    hints: [
      "The pink plate can only be reached through the portal. The pink door needs something holding the plate down.",
      "While imprinting, of the two steps left, one walks back and one hits the wall. Push your shadow into the portal after rewinding, and both play out on the other side.",
      "Imprint below the start: right, left, left. After rewinding, step right to push your shadow into the portal, then take the pink door to the exit.",
    ],
  },
  '11-1': {
    name: "Launch",
    hint: "⏸ is a hold pad. A shadow imprinted on ⏸ waits after the rewind: it doesn't move and doesn't use up steps. ▶ is a release plate. Once anything is on it, every waiting shadow starts moving on the next step.",
    hints: [
      "The pink door is only open on the step the echo crosses the pink plate. In that one step you need to get through two door tiles.",
      "Imprint on ⏸ and take one step right. After the rewind it waits until you step on ▶.",
      "After the rewind, wait two steps, then step onto ▶. Next step the shadow is released, shoves you into the door from behind, and you take one more step yourself.",
    ],
  },
  '11-2': {
    name: "The Long Way",
    hint: "Someone else can step on ▶ for you. Block the echo once and its route changes, and so does the moment it releases the shadow.",
    hints: [
      "Left alone, the echo ducks into the little pocket below and gets stuck. It never reaches ▶.",
      "On the step it tries to duck down, be standing in that pocket.",
      "Imprint on ⏸, one step right. After the rewind, step up into the pocket and wait there to block its step down. It then takes the upper route over ▶ and releases your shadow to push you through.",
    ],
  },
  '11-3': {
    name: "Relay Release",
    hint: "▶ is tucked below an arrow tile. Go down there and you can't come back up. Have one shadow step on it to release another.",
    hints: [
      "You need a push at the door, and you can't be on ▶ at the same time.",
      "First leave a shadow on ⏸ that steps right once. Then go to the tile above ▶ and leave one that steps down once.",
      "Right after rewinding the second time, step back up to the door. It drops onto ▶, and next step the shadow on ⏸ is released and pushes you in.",
    ],
  },
  '12-1': {
    name: "Be the Wall",
    hint: "Echoes marked ▶ only move while ▶ is held down: stand on ▶ and they take a step; step off and they stop where they are. The echo up top walks over the pink plate. Find a way to make it stop there.",
    hints: [
      "The echo up top keeps walking right and leaves the pink plate behind. Something has to stand in its way.",
      "The ▶ echo below walks up past the crossing on that upper path. Stop it right at the crossing and it becomes a wall.",
      "Stand on ▶ for two steps and step off on the third. It stops at the crossing, the echo up top is held on the pink plate, and the pink door stays open.",
    ],
  },
  '12-2': {
    name: "One Step More",
    hint: "Two ▶ echoes share one ▶. Press it and they both take a step; let go and they both stop. Pressing and releasing alone can't land them on their plates at the same time.",
    hints: [
      "The pink one needs 4 steps to its plate, the blue one only 3. Press 3 times and pink is one short; press 4 and blue is one too far.",
      "Give the pink one a free step: push it from behind. The cyan gate only lets you through, and it leads around behind it.",
      "Press ▶ once so both move forward a step. Then go through the cyan gate, get behind the pink one and push it one tile. Come back and press ▶ twice: both stop right on their plates.",
    ],
  },
  '12-3': {
    name: "One Step Short",
    hint: "Two ▶ echoes moving together again. This time the pink one goes one tile too far, so pushing won't help. You have to block it for a step.",
    hints: [
      "The top one reaches the pink plate in 3 steps, the bottom one needs 4 to reach the blue plate. And you have to pass the blue door before the pink one.",
      "The pink one has to take one step fewer, so block it: the step still counts, but it doesn't move. The cyan gate only lets you through, and it leads onto its path.",
      "Press 3 times so the pink one stops on its plate. Then imprint on the tile in front of it, step up once and rewind, and your shadow stays there blocking it. Go back and press ▶ once more: the bottom echo reaches the blue plate and both doors are open.",
    ],
  },
};
