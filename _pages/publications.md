---
layout: page
permalink: /publications/
title: publications
description: Conference and workshop publications.
years: [2022]
nav: true
nav_order: 1
---
<!-- _pages/publications.md -->

<div class="publications">
{% bibliography -f preprints -q @*[author ~= {{page.author_name}}]* %}
{% bibliography -f papers -q @*[author ~= {{page.author_name}}]* %}
</div> 

