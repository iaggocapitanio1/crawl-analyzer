from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Domain',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('host', models.CharField(db_index=True, max_length=255, unique=True)),
                ('registered_domain', models.CharField(db_index=True, max_length=255)),
                ('tld', models.CharField(max_length=63)),
                ('first_seen_at', models.DateTimeField()),
                ('last_seen_at', models.DateTimeField()),
                ('page_count', models.IntegerField(default=0)),
                ('authority_score', models.IntegerField(blank=True, null=True)),
                ('authority_fetched_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('backlink_count', models.IntegerField(blank=True, null=True)),
                ('backlinks_fetched_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('last_refresh_enqueued_at', models.DateTimeField(blank=True, null=True)),
            ],
        ),
        migrations.CreateModel(
            name='Page',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('url', models.CharField(db_index=True, max_length=2048)),
                ('http_status', models.IntegerField(db_index=True)),
                ('content_type', models.CharField(blank=True, default='', max_length=255)),
                ('content_length', models.BigIntegerField(blank=True, null=True)),
                ('fetched_at', models.DateTimeField(db_index=True)),
                ('title', models.CharField(blank=True, default='', max_length=1024)),
                ('description', models.TextField(blank=True, default='')),
                ('meta_keywords', models.TextField(blank=True, default='')),
                ('language', models.CharField(blank=True, db_index=True, max_length=16, null=True)),
                ('seo_score', models.IntegerField(blank=True, null=True)),
                ('seo_fetched_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('last_refresh_enqueued_at', models.DateTimeField(blank=True, null=True)),
                ('domain', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pages', to='crawl.domain')),
            ],
        ),
        migrations.CreateModel(
            name='PageLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('to_url', models.CharField(max_length=2048)),
                ('anchor_text', models.CharField(blank=True, max_length=1024, null=True)),
                ('link_type', models.CharField(choices=[('a', 'Anchor'), ('img', 'Image'), ('script', 'Script'), ('link', 'Link element'), ('iframe', 'IFrame')], default='a', max_length=16)),
                ('position', models.IntegerField(default=0)),
                ('from_page', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='links', to='crawl.page')),
            ],
        ),
        migrations.CreateModel(
            name='StatsSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('computed_at', models.DateTimeField(db_index=True)),
                ('total_domains', models.IntegerField()),
                ('total_pages', models.IntegerField()),
                ('total_backlinks', models.IntegerField()),
                ('pages_2xx', models.IntegerField(default=0)),
                ('pages_4xx', models.IntegerField(default=0)),
                ('pages_5xx', models.IntegerField(default=0)),
            ],
            options={'ordering': ['-computed_at']},
        ),
        migrations.CreateModel(
            name='ExportJob',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('filter_params', models.JSONField(default=dict)),
                ('format', models.CharField(default='csv', max_length=16)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('running', 'Running'), ('completed', 'Completed'), ('failed', 'Failed')], default='pending', max_length=16)),
                ('file_path', models.CharField(blank=True, max_length=1024, null=True)),
                ('row_count', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('error', models.JSONField(blank=True, null=True)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
