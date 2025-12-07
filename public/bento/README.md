Run with this command from the repo root:

```
bento -c public/bento/*.yaml -e .env
```

And to test it:

```
curl -X POST http://localhost:4195/transform -H 'Content-Type: application/json' -d '{"name":"Bob","age":30}'
```

See newly inserted element here: http://localhost:3000/scratch-demo
