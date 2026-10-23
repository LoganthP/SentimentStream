# MapReduce word count (Hadoop Streaming)

Classic MapReduce over the raw posts, to compare with the Spark version
(`trends.mapreduce_wordcount` uses the same map → reduceByKey idea on RDDs).

## Local simulation (no Hadoop needed)
```bash
cd mapreduce
python mapper.py < ../backend/data/samples/nova_100000.csv | sort | python reducer.py | sort -k2,2nr | head -20
```

## On the Docker HDFS cluster
```bash
# copy the input into HDFS
docker compose --profile hdfs exec namenode hdfs dfs -mkdir -p /sentimentstream/input
docker cp ../backend/data/samples/nova_100000.csv namenode:/tmp/posts.csv
docker compose --profile hdfs exec namenode hdfs dfs -put -f /tmp/posts.csv /sentimentstream/input/

# run the streaming job (python3 must exist on the node; the bde2020 images ship it)
docker cp mapper.py namenode:/tmp/ && docker cp reducer.py namenode:/tmp/
docker compose --profile hdfs exec namenode bash -c '
  hadoop jar $HADOOP_HOME/share/hadoop/tools/lib/hadoop-streaming-*.jar \
    -files /tmp/mapper.py,/tmp/reducer.py \
    -mapper "python3 mapper.py" -reducer "python3 reducer.py" \
    -input /sentimentstream/input/posts.csv -output /sentimentstream/wordcount'
docker compose --profile hdfs exec namenode hdfs dfs -cat /sentimentstream/wordcount/part-00000 | sort -k2 -nr | head
```
(Running jobs this way needs YARN; the compose file only starts HDFS, so if you want
to run it on the cluster add the bde2020 resourcemanager/nodemanager images, or just
use the local simulation, which demonstrates the same map → shuffle → reduce flow.)
