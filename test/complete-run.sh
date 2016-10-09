rm -rf out/
mkdir -p out
(sh t-8080.sh | tee out/t-8080.txt)&
(sh t-8253.sh | tee out/t-8253.txt)&
(sh t-v06c.sh | tee out/t-v06c.txt)&
wait
cat out/t-8080.txt out/t-8253.txt out/t-v06c.txt >results.txt
