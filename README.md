# app-redirect-web

私の天才的なアイデアから出来た、「URLごとにタイトルとアイコン付きのリダイレクトページを作成できる」というシンプルなWebサービス。
アイデアは私が出しましたが、コード作成はCodex、ほんの一部の計画にClaudeを雇いました。

## これは何か

このアプリでは、URL・タイトル・アイコン画像を入力すると、専用のリダイレクトURLを作れます。

例えば `https://example.com` を登録すると、`/example` のようなURLを発行し、そのURLにアクセスしたときに自動で `example.com` へ移動します。

リダイレクト時には次の情報も反映されます。

- ページタイトル
- favicon
- apple-touch-icon

## できること

- トップページで URL / タイトル / アイコン画像 を入力
- ドメイン名ベースの `id` を自動生成
- `/:id` 形式のURLを発行
- アクセス時に即リダイレクト
- `わたしのリダイレクト` に、このブラウザで作成したリダイレクトを表示
- `みんなのリダイレクト` に、公開設定のリダイレクトを表示
- スマホでも使えるシンプルなUI

## GitHub Pages 版について

このリポジトリは GitHub Pages で公開し、保存先は Supabase を使う構成です。

主に使うファイルは以下です。

- `index.html`
- `styles.css`
- `app.js`
- `404.html`
- `.nojekyll`
- `config.js`

`404.html` を使って `/example` のようなパスアクセスを受け取り、実際のリダイレクト処理につなげています。

## 公開後のURL例

GitHub Pages で公開すると、URLはだいたい次のようになります。

- トップページ  
  `https://<GitHubユーザー名>.github.io/<リポジトリ名>/`

- リダイレクトページ  
  `https://<GitHubユーザー名>.github.io/<リポジトリ名>/example`

## Supabase セットアップ

1. Supabase で新しいプロジェクトを作成します。
2. `SQL Editor` を開き、まず次のSQLで `redirects` テーブルを作成します。

```sql
create table if not exists public.redirects (
  id text primary key,
  url text not null,
  title text not null,
  icon_url text not null,
  icon_path text not null,
  creator_key text,
  network_key text,
  is_public boolean not null default true,
  app_scheme text
);
```

3. テーブルができたら、カラムは次の状態になっていればOKです。

- `id` : `text` / Primary Key
- `url` : `text`
- `title` : `text`
- `icon_url` : `text`
- `icon_path` : `text`
- `creator_key` : `text`
- `network_key` : `text`
- `is_public` : `boolean` / default `true`
- `app_scheme` : `text` / 任意

4. `Storage` で `redirect-icons` という public bucket を作成します。
5. そのあと `SQL Editor` で次のSQLを実行します。

```sql
alter table public.redirects enable row level security;

drop policy if exists "redirects are readable by everyone" on public.redirects;
drop policy if exists "redirects are writable by everyone" on public.redirects;
drop policy if exists "redirects are updatable by everyone" on public.redirects;
drop policy if exists "redirects are deletable by everyone" on public.redirects;
drop policy if exists "icons are readable by everyone" on storage.objects;
drop policy if exists "icons are writable by everyone" on storage.objects;
drop policy if exists "icons are updatable by everyone" on storage.objects;
drop policy if exists "icons are deletable by everyone" on storage.objects;

drop function if exists public.get_redirect_by_id(text);
drop function if exists public.update_redirect_by_id(text, text, text, text, text, text, text, boolean, text);
drop function if exists public.delete_redirect_by_id(text);

create or replace function public.get_redirect_by_id(p_id text)
returns table (
  id text,
  url text,
  title text,
  icon_url text,
  icon_path text,
  app_scheme text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    redirects.id,
    redirects.url,
    redirects.title,
    redirects.icon_url,
    redirects.icon_path,
    redirects.app_scheme
  from public.redirects
  where redirects.id = p_id
  limit 1;
$$;

grant execute on function public.get_redirect_by_id(text) to anon;

create or replace function public.update_redirect_by_id(
  p_id text,
  p_url text,
  p_title text,
  p_icon_url text,
  p_icon_path text,
  p_creator_key text,
  p_network_key text,
  p_is_public boolean,
  p_app_scheme text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.redirects
  set
    url = p_url,
    title = p_title,
    icon_url = p_icon_url,
    icon_path = p_icon_path,
    creator_key = p_creator_key,
    network_key = p_network_key,
    is_public = p_is_public,
    app_scheme = p_app_scheme
  where id = p_id;
$$;

create or replace function public.delete_redirect_by_id(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.redirects
  where id = p_id;
$$;

grant execute on function public.update_redirect_by_id(text, text, text, text, text, text, text, boolean, text) to anon;
grant execute on function public.delete_redirect_by_id(text) to anon;

create policy "redirects are readable by everyone"
on public.redirects
for select
to anon
using (true);

create policy "redirects are writable by everyone"
on public.redirects
for insert
to anon
with check (true);

create policy "icons are readable by everyone"
on storage.objects
for select
to anon
using (bucket_id = 'redirect-icons');

create policy "icons are writable by everyone"
on storage.objects
for insert
to anon
with check (bucket_id = 'redirect-icons');

create policy "icons are updatable by everyone"
on storage.objects
for update
to anon
using (bucket_id = 'redirect-icons')
with check (bucket_id = 'redirect-icons');

create policy "icons are deletable by everyone"
on storage.objects
for delete
to anon
using (bucket_id = 'redirect-icons');
```

このSQLでは、`redirects` テーブルの読み取りを許可します。
そのため、アプリ上では `みんなのリダイレクト` に公開設定のリダイレクトが表示されます。

すでに `redirects` テーブルを作成済みで、`creator_key`、`network_key`、`is_public`、`app_scheme` がない場合は、追加で次のSQLを実行します。

```sql
alter table public.redirects
add column if not exists creator_key text,
add column if not exists network_key text,
add column if not exists is_public boolean not null default true,
add column if not exists app_scheme text;
```

6. `Project Settings` → `API` で `Project URL` と `anon` key を確認します。
7. `config.js` を開いて、次のように値を入れます。

```js
window.APP_CONFIG = {
  supabaseUrl: "https://your-project-id.supabase.co",
  supabaseAnonKey: "your-anon-key",
  supabaseBucket: "redirect-icons"
};
```

## 使い方

1. GitHub にこのファイル一式をアップロードします。
2. リポジトリの `Settings` を開きます。
3. 左メニューの `Pages` を開きます。
4. `Build and deployment` の `Source` を `Deploy from a branch` にします。
5. ブランチは `main`、フォルダは `/ (root)` を選んで保存します。
6. 数分待つと GitHub Pages の公開URLが表示されます。
7. 公開URLを開いて、リダイレクトを作成します。

## 作成の流れ

1. トップページを開く
2. リダイレクト先URLを入力する
3. アプリを直接開きたい場合だけ、`chatgpt://` のようなアプリURLを入力する
4. タイトルを入力する
5. アイコン画像を選ぶ
6. `作成` を押す
7. 発行されたURLを開く
8. そのURLにアクセスすると、自動で登録先へ移動する

## アプリを直接開くURL

`アプリを直接開くURL` は任意です。

- 未入力: 通常通り `https://example.com` などのWeb URLへ移動します。
- 入力あり: リダイレクトページを開いた直後に `chatgpt://` などのアプリURLを自動で試します。iOS側でブロックされた場合のために、`アプリを開く` ボタンも表示します。

例:

- ChatGPT: `chatgpt://`
- X/Twitter: 通常は `https://x.com` だけでもアプリが開くことがあります。必要な場合だけURL Schemeを指定します。

iPhone Safariでは、自動リダイレクトからのURL Scheme起動や、JavaScriptを挟んだUniversal Link起動がブロックされる場合があります。
そのため、このサイトではアプリURLの自動起動を試したあと、失敗しても手動で押せる `アプリを開く` ボタンを残します。

## id の決まり方

`id` は、入力したURLのドメイン名ベースで決まります。

例:

- `https://example.com` → `example`
- `https://www.example.com` → `example`

同じ名前がすでにある場合は、次のように連番が付きます。

- `example`
- `example-2`
- `example-3`

## 注意

この版では保存に Supabase を使っています。

そのため、作成したリダイレクト情報は次の場所で共通して使えます。

- 別のブラウザ
- 別の端末
- 同じWi-Fiでなくても可

`みんなのリダイレクト` には、公開設定のリダイレクトが表示されます。
`わたしのリダイレクト` には、このブラウザで作成したID、または同じブラウザID・同じネットワーク判定のリダイレクトを表示します。

リダイレクトページの仕組み上、正確な `/id` を知っている人はそのリダイレクトを開けます。
これは「専用URLを共有したら開ける」ために必要な仕様です。
「みんなのリダイレクト」を使うため、公開設定のリダイレクトは他の人からも見えます。
見せたくない場合は、作成時または編集時に `みんなのリダイレクトに表示` をOFFにしてください。

## ローカル開発用ファイル

このリポジトリには、開発時に使っていた Node.js サーバー版のファイルも入っています。

- `server.js`
- `public/`
- `data/`

ただし、GitHub Pages では Node.js サーバーは動かないため、公開用として使うのは静的ファイル版です。

## メモ

「シンプルで実用的」を優先して、構成はできるだけ小さくしています。
