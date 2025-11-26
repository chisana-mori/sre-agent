IMAGE_NAME := sre-agent
PORT := 8081

.PHONY: build run

build:
	docker build -t $(IMAGE_NAME) .

run:
	docker run -p $(PORT):$(PORT) $(IMAGE_NAME)
