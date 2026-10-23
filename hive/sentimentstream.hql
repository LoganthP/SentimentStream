-- SentimentStream: HiveQL analytics over the processed Parquet output (syllabus Module 4)
-- Replace JOB_ID with a real job id (shown in the dashboard's Jobs page).
-- With HDFS enabled the processed data lives at hdfs://namenode:9000/sentimentstream/processed/JOB_ID
-- Run in Hive:          hive -f sentimentstream.hql
-- or in Spark SQL:      spark-sql -f sentimentstream.hql   (no Hive install needed)

CREATE DATABASE IF NOT EXISTS sentimentstream;
USE sentimentstream;

DROP TABLE IF EXISTS posts;
CREATE EXTERNAL TABLE posts (
    post_id     STRING,
    text        STRING,
    clean_text  STRING,
    tokens      ARRAY<STRING>,
    hashtags    ARRAY<STRING>,
    aspects     ARRAY<STRING>,
    ts          TIMESTAMP,
    `date`      DATE,
    topic       STRING,
    platform    STRING,
    rating      DOUBLE,
    label       DOUBLE,
    sentiment   STRING,
    confidence  DOUBLE
)
STORED AS PARQUET
LOCATION 'hdfs://namenode:9000/sentimentstream/processed/JOB_ID';

-- 1. Overall sentiment distribution
SELECT sentiment, COUNT(*) AS posts, ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM posts GROUP BY sentiment ORDER BY posts DESC;

-- 2. Daily sentiment trend
SELECT `date`,
       SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
       SUM(CASE WHEN sentiment = 'neutral'  THEN 1 ELSE 0 END) AS neutral,
       SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative
FROM posts GROUP BY `date` ORDER BY `date`;

-- 3. Word frequency (the MapReduce word count, written in HiveQL)
SELECT word, COUNT(*) AS freq
FROM posts LATERAL VIEW explode(tokens) t AS word
WHERE length(word) > 2
GROUP BY word ORDER BY freq DESC LIMIT 25;

-- 4. Aspect-level sentiment (which features get the most complaints?)
SELECT aspect,
       COUNT(*) AS mentions,
       ROUND(100 * AVG(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END), 1) AS negative_pct
FROM posts LATERAL VIEW explode(aspects) a AS aspect
GROUP BY aspect ORDER BY negative_pct DESC;

-- 5. Trending hashtags
SELECT tag, COUNT(*) AS uses
FROM posts LATERAL VIEW explode(hashtags) h AS tag
GROUP BY tag ORDER BY uses DESC LIMIT 15;

-- 6. Product / topic comparison
SELECT topic, COUNT(*) AS posts,
       ROUND(100 * (SUM(CASE WHEN sentiment='positive' THEN 1 ELSE 0 END)
                  - SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END)) / COUNT(*), 1) AS net_score
FROM posts WHERE topic IS NOT NULL GROUP BY topic ORDER BY posts DESC;
