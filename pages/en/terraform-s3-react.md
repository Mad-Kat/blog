---
layout: post.njk
title: Terraform S3 react app (single page)
translationKey: terraform-s3-react
date: "2022-07-01T17:00+02:00"
permalink: "{{locale}}/{{translationKey}}.html"

introText: How to setup OTC to host a single page application on S3 (OBS)?
---

I had the opportunity to create a fresh/new single page application for an internal tool at my company.
We didn’t have any frontend applications running on that cloud provider, as we are in the middle of migrating from AWS to Open Telekom Cloud (OTC).
So I approached the problem of how/where exactly we should host the application since some time.
I knew back in my head that it should be possible to host the bundled/compiled files on the S3 equivalent of OTC called Object Storage Service (OBS).
So I setup the whole deployment with terraform (cloud), GitHub workflows and OTC.
At the end I figured out that the deployment works and is actually quite nice.
Even HTTPS works out of the box, but apparently only for the provided domain and not a custom one.
That was the deal breaker, which I figured out way too late, because I really wanted it to be hosted on a custom domain.
So at the end I replaced the setup with a our “normal” deployment, which creates a Kubernetes service that runs a Nginx image with the frontend files.
But nevertheless I want to show you how I setup the React application on S3 respectively OBS.

The first step is to create the public accessible S3-bucket.

```jsx
resource "opentelekomcloud_s3_bucket" "frontend_bucket" {
  bucket = "frontend-app"
  acl    = "public-read"
}
```

Afterwards we need an attached policy, that allows us to access the bucket contents from the outside for everyone.
Additionally we need to configure the bucket that it responses with the root html file when the index page is requested.
Additionally we can specify the error page, which is shown when we want to access a resource/path that isn’t available.

```jsx
resource "opentelekomcloud_s3_bucket" "frontend_bucket" {
  bucket = local.bucket_name
  acl    = "public-read"
  website {
    index_document = "index.html"
    error_document = "error.html"
  }
  policy = <<POLICY
  {
    "Version": "2008-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal":{
                "AWS":["*"]
            },
            "Action": [
                "s3:GetObject"
            ],
            "Resource": [
                "arn:aws:s3:::${local.bucket_name}/*"
            ]
        }
    ]
}
POLICY
}
```

With this we have the basic setup done and we can look into the two other parts we have to do.

First the setup of the build process for the frontend application. There it’s just important that the output is a folder with all the necessary files to host it and a single html entry point. So basically the standard create-react-app (CRA) build process.

At last the most interesting one. We need to upload the output of the build process (all files and directories) to the bucket and set the correct MIME-types.

Uploading the files and directories is easy done with terraform.

```jsx
resource "opentelekomcloud_s3_bucket_object" "frontend_object" {
  for_each = fileset("./build", "**")
  key      = each.value
  source   = "${path.module}/build/${each.value}"
  bucket   = opentelekomcloud_s3_bucket.frontend_bucket.bucket
}
```

So we create a set for all files in a specific directory. In this case `./build` and all nested directories [^1] and create a bucket object for each one of the files.

We specify the corresponding MIME-type for each file and add a etag with the hashed contents of the file (so that html response can be correctly cached and invalidated when the content changes).

```jsx
resource "opentelekomcloud_s3_bucket_object" "frontend_object" {
  for_each = fileset("${path.module}/build", "**")
  key      = each.value
  source   = "${path.module}/build/${each.value}"
  bucket   = opentelekomcloud_s3_bucket.frontend_bucket.bucket

  etag         = filemd5("${path.module}/build/${each.value}")
  content_type = lookup(local.mime_map, regex("\\.[^.]+$", each.value), null)
}
```

The secret sauce is still not spilled. The content type will be assigned through a lookup of the file extension in a map. In order to do that we need to create such a map.

```jsx
locals {
	mime_map = {
		".html" = "text/html"
		".css" = "text/css"
		".js" = "application/javascript"
	}
}
```

But this only maps three different types of files and there could be a lot more (images, illustrations, videos...). So in order to map most of the common file types we can use a [file](file) that shows the mapping per line according to the [iana](<[https://www.iana.org/assignments/media-types/media-types.xhtml](https://www.iana.org/assignments/media-types/media-types.xhtml)>) and generate a map out of it with the help of terraform.

```jsx
locals {
  raw_content = file("./mime.types")
  raw_lines = [
    for rawl in split("\n", local.raw_content) :
    trimspace(replace(rawl, "/(#.*)/", ""))
  ]
  lines = [
    for l in local.raw_lines : split(" ", replace(l, "/\\s+/", " "))
    if l != ""
  ]
  pairs = flatten([
    for l in local.lines : [
      for suf in slice(l, 1, length(l)) : {
        content_type = l[0]
        suffix       = ".${suf}"
      }
    ]
  ])
  # There can potentially be more than one entry for the same
  # suffix in a mime.types file, so we'll gather them all up
  # here and then just discard all but the first one when
  # we produce our result below, mimicking a behavior of
  # scanning through the mime.types file until you find the
  # first mention of a particular suffix.
  mime_map = tomap({
    for pair in local.pairs : pair.suffix => pair.content_type...
  })
}
```

With this the setup is complete and we have a public accessible bucket with all built files with the correct MIME-types and cache handling. The only problem that remains is that we can’t host the bucket on a different domain with a working SSL setup. At least not on OTC.

[^1]: [https://www.terraform.io/language/functions/fileset](https://www.terraform.io/language/functions/fileset)
