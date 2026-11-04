#!/bin/sh
# Refait Tony de zéro : détourage → calques → visages → rig → animations. Lancer depuis le dossier RigLab.
set -e
T=../../slots/pizza-rush/art/tony; S=../../slots/pizza-rush/sources/tony; PY=".venv/bin/python -I"
$PY atelier/pizza-rush/tony_detoure.py $S/Pizza_delivery_boy_standing_relaxed_735cf5a4.jpg $T/reference.png
$PY atelier/pizza-rush/tony_detoure.py $S/Head_image_with_magenta_background_641885b4.jpg $T/tete.png
for e in Same_image_with_closed_eyes_40fc6328:yeux-fermes Person_laughing_with_open_mouth_8198beb6:rire Person_with_shocked_expression_7fa1865c:choc Tired_person_sweating_with_sadness_57f55559:triste Person_winking_with_right_eye_22be24d4:clin; do
  $PY atelier/pizza-rush/tony_detoure.py $S/${e%%:*}.jpg $T/brut-${e##*:}.png; done
$PY atelier/pizza-rush/tony_calques.py $T
$PY atelier/pizza-rush/tony_visages.py $T/calques
rm -rf ../../slots/pizza-rush/anims/tony
C=$T/calques
OUT=$(./rl calques pizza-rush/tony $C/corps.png $C/bras-d.png:bras-d $C/bras-g.png:bras-g $C/tete.png:tete $C/casquette.png:casquette \
  $C/visage-yeux-fermes.png:visage-yeux-fermes $C/visage-rire.png:visage-rire $C/visage-choc.png:visage-choc $C/visage-triste.png:visage-triste $C/visage-clin.png:visage-clin --cote 900); echo "$OUT"
F=$(echo "$OUT" | sed -n 's/.*facteur \([0-9.]*\), cadre \[\([0-9]*\), \([0-9]*\),.*/\1 \2 \3/p')
$PY atelier/pizza-rush/tony_rig.py $F
./rl controle pizza-rush/tony
