---
layout: post.njk
title: Terraform S3 react app (single page)
translationKey: terraform-s3-react
date: "2022-07-01T17:00+02:00"
permalink: "{{locale}}/{{translationKey}}.html"

introText: Wie richtet man eine Single-Page-Applikation auf OTC ein?
---

Ich bekam die Gelegenheit, eine neue Singlepage-Anwendung für ein internes Tool in meinem Unternehmen zu erstellen. Wir hatten noch keine Frontend-Anwendungen, die bei diesem Cloud-Anbieter liefen, da wir mitten in der Migration von AWS zur Open Telekom Cloud (OTC) steckten. Also habe ich mich seit einiger Zeit mit dem Problem beschäftigt, wie/wo genau wir die Anwendung hosten sollten. In meinem Kopf wusste ich, dass es möglich sein sollte, die gebündelten/kompilierten Dateien auf dem S3-Äquivalent von OTC, dem Object Storage Service (OBS), zu hosten. Also habe ich die gesamte Bereitstellung mit Terraform (Cloud), GitHub-Workflows und OTC eingerichtet. Am Ende habe ich herausgefunden, dass das Deployment funktioniert und eigentlich ganz nett ist. Sogar HTTPS funktioniert sofort, aber offenbar nur für die bereitgestellte Domain und nicht für eine benutzerdefinierte. Das war der Knackpunkt, den ich viel zu spät herausfand. Also habe ich das Setup am Ende durch unser "normales" Deployment ersetzt, das einen Kubernetes-Dienst erstellt, der ein Nginx-Image mit den Frontend-Dateien ausführt. Trotzdem möchte ich euch zeigen, wie ich die React-Anwendung auf S3 bzw. OBS aufgesetzt habe.

Der erste Schritt ist das Erstellen des öffentlich zugänglichen S3-Bucket.

```jsx
resource "opentelekomcloud_s3_bucket" "frontend_bucket" {
  bucket = "frontend-app"
  acl    = "public-read"
}
```

Nachher brauchen wir eine angehängte Policy, die den Zugriff von ausserhalb für jeden bereitstellt. Zusätzlich müssen wir noch den Bucket so konfigurieren, dass er mit der Root-HTML-Datei antwortet wenn die Indexseite angefragt wird. Optional können wir eine Fehlerseite spezifizieren, welche angezeigt wird wenn der Zugriff auf eine Resource oder Pfad nicht möglich ist.

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

Damit ist die grundlegende Einrichtung abgeschlossen und wir können uns den beiden anderen Teilen zuwenden.

Zunächst die Einrichtung des Build-Prozesses für die Frontend-Anwendung. Hier ist es nur wichtig, dass die Ausgabe ein Ordner mit allen notwendigen Dateien ist, um sie hosten zu können und einen einzigen HTML-Einstiegspunkt. Also im Grunde der Standard create-react-app (CRA) Build-Prozess.

Zu guter Letzt der interessanteste Teil. Wir müssen die Ausgabe des Build-Prozesses (alle Dateien und Verzeichnisse) in den Bucket hochladen und die richtigen MIME-Typen einstellen.

Das Hochladen der Dateien und Verzeichnisse ist mit Terraform einfach zu bewerkstelligen.

```jsx
resource "opentelekomcloud_s3_bucket_object" "frontend_object" {
  for_each = fileset("./build", "**")
  key      = each.value
  source   = "${path.module}/build/${each.value}"
  bucket   = opentelekomcloud_s3_bucket.frontend_bucket.bucket
}
```

Wir erstellen also einen Satz für alle Dateien in einem bestimmten Verzeichnis. In diesem Fall `./build` und alle verschachtelten Verzeichnisse [^1] und erstellen für jede der Dateien ein Bucket-Objekt.

Wir geben für jede Datei den entsprechenden MIME-Typ an und fügen ein etag mit dem gehashten Inhalt der Datei hinzu (damit die HTML-Antwort korrekt zwischengespeichert und bei Änderungen des Inhalts ungültig gemacht werden kann).

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

Das Geheimnis ist noch nicht gelüftet. Der Inhaltstyp wird durch eine Suche nach der Dateierweiterung in einer Map zugewiesen. Damit das auch funktioniert müssen wir eine solche Map erstellen.

```jsx
locals {
	mime_map = {
		".html" = "text/html"
		".css" = "text/css"
		".js" = "application/javascript"
	}
}
```

Damit werden aber nur drei verschiedene Dateitypen abgebildet und es gibt ja eigentlich noch viel mehr (Bilder, Illustrationen, Videos...). Um also die meisten gängigen Dateitypen abzubilden, können wir eine [Datei](datei) verwenden, die die Zuordnung pro Zeile entsprechend der [iana](<[https://www.iana.org/assignments/media-types/media-types.xhtml](https://www.iana.org/assignments/media-types/media-types.xhtml)>) anzeigt, und daraus mit Hilfe von terraform eine Map erstellen.

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

Damit ist die Einrichtung abgeschlossen und wir haben einen öffentlich zugänglichen Bucket mit allen erstellten Dateien mit den richtigen MIME-Typen und Cache-Verarbeitung. Das einzige Problem, das bleibt ist, dass wir den Bucket nicht auf einer anderen Domain mit einer funktionierenden SSL-Einrichtung hosten können. Zumindest nicht auf OTC.

[^1]: [https://www.terraform.io/language/functions/fileset](https://www.terraform.io/language/functions/fileset)
