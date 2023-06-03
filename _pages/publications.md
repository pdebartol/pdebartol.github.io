---
layout: page
permalink: /publications/
title: research
description: publications by categories in reversed chronological order. [*] denotes equal contribution.
years: [2023, 2022]
nav: true
nav_order: 1
---

#### conferences
<!-- _pages/publications.md -->
<div class="publications">

{%- for y in page.years %}
  {% bibliography -f papers -q @*[year={{y}}]* %}
{% endfor %}

</div>

#### workshops

<div class="publications">

{%- for y in page.years %}
  {% bibliography -f workshop -q @*[year={{y}}]* %}
{% endfor %}

</div>